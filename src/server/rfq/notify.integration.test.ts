import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import IORedis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { MemoryTransport } from "@/lib/email";
import { RFQ_JOB_OPTIONS } from "@/lib/queue";
import { processRfqSubmitted } from "./notify";
import { isFinalAttempt } from "@/server/queue/worker-runtime";

/**
 * THE PROVIDER-FAILURE KEYSTONE (Story 3.3, AC13).
 *
 * The epics require this proof to run "against a deterministic in-process mail
 * transport and a queue Redis provisioned by ci.yml, and FAIL — never skip —
 * when either is absent". So: a REAL BullMQ Worker, a REAL queue instance, the
 * REAL `processRfqSubmitted`, and the memory transport as the instrument. The
 * only fakes are the repository functions, injected — this suite must not
 * require Postgres, and mocking the flow itself would prove nothing about the
 * thing that actually runs in production.
 *
 * ⚠️ A DEDICATED, FIXED-NAME TEST QUEUE, OBLITERATED AT BOTH ENDS. Never the
 * production `rfq.submitted` name — a developer running this against a live
 * instance must not consume real inquiries. Fixed rather than per-run unique
 * because the queue instance is AOF-backed and survives restarts: a unique name
 * per run would leave a permanent litter of orphan queues, each with its own
 * scheduler, that nothing ever cleans. `obliterate` in BOTH `beforeAll` and
 * `afterAll` is what makes a crashed previous run unable to haunt this one.
 *
 * ⚠️ FAILS, NEVER SKIPS, IN CI. `ci.yml` provisions the queue, so an
 * unreachable one there is a defect — the `beforeAll` asserts rather than skips.
 */

const TEST_QUEUE = "test.rfq.submitted";
const CI = Boolean(process.env.CI);

let connection: IORedis | null = null;
let workerConnection: IORedis | null = null;
let queue: Queue | null = null;
let worker: Worker | null = null;
let ready = false;

/** Deterministic clock so stamped timestamps are assertable. */
const NOW = new Date("2026-08-27T10:00:00.000Z");

/** The in-memory "database" the flow writes through. */
interface Row {
  id: string;
  reference: string;
  name: string;
  company: string;
  email: string;
  locale: string | null;
  notifiedAt: Date | null;
  confirmationSentAt: Date | null;
  deliveryFailureReason: string | null;
}
const rows = new Map<string, Row>();

/** One entry per PROCESSOR INVOCATION — the instrument the dedup test needs. */
const processed: string[] = [];

function seed(id: string, over: Partial<Row> = {}): Row {
  const row: Row = {
    id,
    reference: `GLH-RFQ-${2000 + rows.size}`,
    name: "Elena Petrova",
    company: "Enka EPC",
    email: `${id}@example.com`,
    locale: "en",
    notifiedAt: null,
    confirmationSentAt: null,
    deliveryFailureReason: null,
    ...over,
  };
  rows.set(id, row);
  return row;
}

const repoDeps = {
  findLead: async (id: string) => (rows.get(id) ?? null) as never,
  markSent: async (id: string, kind: "notify" | "confirm", at: Date) => {
    const row = rows.get(id);
    if (!row) return;
    if (kind === "notify") row.notifiedAt = at;
    else row.confirmationSentAt = at;
  },
  recordFailure: async (id: string, reason: string) => {
    const row = rows.get(id);
    if (!row) return;
    row.deliveryFailureReason = row.deliveryFailureReason
      ? `${row.deliveryFailureReason};${reason}`
      : reason;
  },
  now: () => NOW,
};

const transport = new MemoryTransport();

/** Wait for a job to reach a terminal state, bounded so a stuck queue fails
 *  the test rather than hanging the suite. */
function settle(job: Job, ms = 20_000): Promise<"completed" | "failed"> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`job ${job.id} never settled`)), ms);
    const poll = setInterval(async () => {
      const state = await job.getState().catch(() => "unknown");
      if (state === "completed" || state === "failed") {
        clearTimeout(timer);
        clearInterval(poll);
        resolve(state);
      }
    }, 100);
  });
}

beforeAll(async () => {
  const { probeQueueReady, queueUrl } = await import("../../../e2e/queueReady");
  ready = await probeQueueReady();
  if (CI) {
    expect(
      ready,
      "CI provisions redis-queue — an unreachable queue here is a defect, not an environment",
    ).toBe(true);
  }
  if (!ready) return;

  const url = queueUrl()!;
  connection = new IORedis(url, { maxRetriesPerRequest: null });
  connection.on("error", () => {});
  workerConnection = new IORedis(url, { maxRetriesPerRequest: null });
  workerConnection.on("error", () => {});

  queue = new Queue(TEST_QUEUE, { connection: connection as never });
  // BOTH ends: a crashed previous run must not leak jobs or schedulers into
  // this one, and this run must not leak into the next.
  await queue.obliterate({ force: true }).catch(() => {});

  worker = new Worker(
    TEST_QUEUE,
    async (job: Job) => {
      const { leadId } = job.data as { leadId: string };
      // EVERY PROCESSOR ENTRY IS RECORDED. Without this the dedup test below
      // could not fail: its assertions were "the id I passed came back" and
      // "two emails were sent", and the second holds even when the flow runs
      // twice, because the second run short-circuits on the stamps the first
      // one wrote. Counting invocations is the only way to observe the
      // property the test is named for.
      processed.push(leadId);
      // The SHIPPED arithmetic, imported rather than copied. The harness used
      // to duplicate the expression, which meant an error in it would be
      // reproduced identically here and the integration suite could never
      // detect it.
      const outcome = await processRfqSubmitted(leadId, {
        transport,
        ...repoDeps,
        isFinalAttempt: isFinalAttempt(job),
      });
      if (outcome.retry) throw new Error(`delivery incomplete for ${leadId}`);
      return outcome;
    },
    { connection: workerConnection as never },
  );
  await worker.waitUntilReady();
}, 60_000);

afterAll(async () => {
  await worker?.close().catch(() => {});
  await queue?.obliterate({ force: true }).catch(() => {});
  await queue?.close().catch(() => {});
  connection?.disconnect();
  workerConnection?.disconnect();
});

beforeEach(() => {
  rows.clear();
  transport.reset();
  processed.length = 0;
  process.env.RFQ_NOTIFY_TO = "aylin@glh.example";
});

describe("the worker, end to end against a real queue (AC13)", () => {
  it("a job flows through a REAL Worker and sends both emails", async ({ skip }) => {
    if (!ready) return skip();
    const row = seed("lead-happy");
    const job = await queue!.add("rfq.submitted", { leadId: row.id }, { jobId: row.id });

    expect(await settle(job)).toBe("completed");
    expect(transport.sent).toHaveLength(2);
    // The stamps are what a retry would consult — the durable half of the proof.
    expect(rows.get("lead-happy")!.notifiedAt).toEqual(NOW);
    expect(rows.get("lead-happy")!.confirmationSentAt).toEqual(NOW);
  }, 40_000);

  it("THE PROVIDER-FAILURE PROOF: a failing send retries, then succeeds, sending ONE confirmation", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // The epics' keystone. The transport fails the FIRST notification; BullMQ
    // retries; the second attempt's short-circuit skips nothing (nothing was
    // stamped) and both sends land. The count is what proves the buyer was not
    // emailed twice.
    const row = seed("lead-retry");
    transport.failNext();
    const job = await queue!.add(
      "rfq.submitted",
      { leadId: row.id },
      { jobId: row.id, attempts: 3, backoff: { type: "fixed", delay: 200 } },
    );

    expect(await settle(job)).toBe("completed");
    const confirmations = transport.sent.filter((m) => m.to === "lead-retry@example.com");
    expect(confirmations).toHaveLength(1);
    const notifications = transport.sent.filter((m) => m.to === "aylin@glh.example");
    expect(notifications).toHaveLength(1);
    expect(rows.get("lead-retry")!.notifiedAt).toEqual(NOW);
  }, 40_000);

  it("EXACTLY ONCE ACROSS RETRIES: the confirmation is never re-sent once stamped", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // AC9's scenario driven through the real machinery: the confirmation
    // succeeds on attempt 1, the NOTIFICATION keeps failing, and the retries
    // must not re-send the confirmation. Without the per-email short-circuit
    // the buyer receives one email per attempt.
    const row = seed("lead-once");
    // Fail the NOTIFICATION on every attempt while confirmations succeed.
    // ⚠️ `failNext` cannot express this: its FIFO is consumed by both sends, so
    // three queued failures actually starve the confirmation on attempt one and
    // the job then COMPLETES on attempt three — which is how the first version
    // of this test asserted the wrong terminal state.
    transport.failMatching((message) => message.to === "aylin@glh.example");
    const job = await queue!.add(
      "rfq.submitted",
      { leadId: row.id },
      { jobId: row.id, attempts: 3, backoff: { type: "fixed", delay: 200 } },
    );

    expect(await settle(job)).toBe("failed");
    const confirmations = transport.sent.filter((m) => m.to === "lead-once@example.com");
    expect(confirmations, "the buyer must receive exactly one confirmation").toHaveLength(1);
    // …and the exhausted notification recorded its terminal, prefixed code.
    expect(rows.get("lead-once")!.deliveryFailureReason).toBe("notify:provider");
  }, 40_000);

  it("jobId DEDUPLICATES: adding the same lead twice runs the flow once", async ({ skip }) => {
    if (!ready) return skip();
    /**
     * ⚠️ THIS TEST USED TO BE GREEN WHETHER OR NOT DEDUP HAPPENED, and three
     * lenses filed it. Its two assertions were `second.id === first.id` — which
     * is guaranteed because BOTH adds pass the same literal `jobId`, so the id
     * comes from the caller and not from dedup — and `transport.sent` having
     * length 2, which holds even when the flow runs TWICE, because the second
     * run short-circuits on the `notifiedAt`/`confirmationSentAt` stamps the
     * first one wrote. Neither could observe the property in the test's name.
     *
     * The instrument that can: count processor entries.
     */
    const row = seed("lead-dedup");
    const first = await queue!.add("rfq.submitted", { leadId: row.id }, { jobId: row.id });
    const second = await queue!.add("rfq.submitted", { leadId: row.id }, { jobId: row.id });
    expect(second.id).toBe(first.id);
    expect(await settle(first)).toBe("completed");

    // Drain: a second job, had dedup not suppressed it, would still be waiting
    // or active here. Settle only follows the FIRST one.
    const deadline = Date.now() + 10_000;
    for (;;) {
      const counts = await queue!.getJobCounts("waiting", "active", "delayed");
      const outstanding = (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0);
      if (outstanding === 0 || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // THE ASSERTION THAT CAN FAIL. Without dedup this reads 2.
    expect(
      processed.filter((id) => id === row.id),
      "the flow must have been entered exactly once",
    ).toHaveLength(1);
    expect(transport.sent).toHaveLength(2);
  }, 40_000);

  it("a job for a DELETED lead completes rather than burning the retry budget", async ({
    skip,
  }) => {
    if (!ready) return skip();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const job = await queue!.add("rfq.submitted", { leadId: "never-existed" }, { jobId: "gone" });
    expect(await settle(job)).toBe("completed");
    expect(transport.sent).toHaveLength(0);
    warn.mockRestore();
  }, 40_000);

  it("an exhausted job lands in the DEAD-LETTER set an operator can list (AC8/AC10)", async ({
    skip,
  }) => {
    if (!ready) return skip();
    // `removeOnFail: false` is what makes the failed set durable. If it were
    // ever flipped to true, this job would vanish and `queue:failed` would
    // report an empty dead-letter set while inquiries went unsent.
    const row = seed("lead-dead");
    for (let i = 0; i < 5; i++) transport.failNext();
    const job = await queue!.add(
      "rfq.submitted",
      { leadId: row.id },
      { ...RFQ_JOB_OPTIONS, jobId: row.id, attempts: 2, backoff: { type: "fixed", delay: 200 } },
    );
    expect(await settle(job)).toBe("failed");

    const failed = await queue!.getFailed(0, 50);
    expect(failed.map((j) => j.id)).toContain(row.id);
  }, 40_000);
});
