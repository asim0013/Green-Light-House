import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueRfqSubmitted,
  isQueueConfigured,
  resetRfqQueueForTests,
  RFQ_JOB_NAME,
  RFQ_JOB_OPTIONS,
  RFQ_QUEUE_NAME,
  type RfqQueueLike,
} from "./queue";
import { resetLogThrottleForTests } from "./redis";

/**
 * The producer's contract (Story 3.3, AC1/AC2/AC3).
 *
 * EVERY TEST INJECTS A FAKE QUEUE. vitest loads `.env` (vitest.setup.ts), so an
 * un-injected producer would reach for the developer's REAL queue instance —
 * and the `redis-queue` container is frequently not running, where ioredis's
 * default retry-forever behaviour makes the call hang rather than fail. The
 * injection seam is what keeps this suite fast, offline and honest.
 *
 * The one property every assertion here serves: A FAILED ENQUEUE IS NEVER AN
 * ERROR. The lead is already committed by the time this code runs, so anything
 * that throws or hangs costs a submission — which is the exact failure FR29
 * exists to prevent.
 */

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetRfqQueueForTests();
  // The throttle map is MODULE state: without this the first coded-line
  // assertion in this file consumes the 30s window and every later one sees
  // zero calls — an order-dependent suite blaming the code for a harness bug.
  resetLogThrottleForTests();
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
});

/** A queue that records what it was asked to add. */
function recordingQueue() {
  const calls: { name: string; data: unknown; opts: Record<string, unknown> }[] = [];
  const queue: RfqQueueLike = {
    add: async (name, data, opts) => {
      calls.push({ name, data, opts });
      return { id: String(opts.jobId) };
    },
  };
  return { queue, calls };
}

describe("enqueueRfqSubmitted — the happy path", () => {
  it("adds ONE job carrying only the lead id, keyed by it", async () => {
    const { queue, calls } = recordingQueue();
    const result = await enqueueRfqSubmitted("lead-1", { getQueue: async () => queue });

    expect(result).toEqual({ enqueued: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe(RFQ_JOB_NAME);
    // ONLY the id — the worker re-reads the row, so a job that outlives a
    // deploy sends current truth rather than a stale snapshot.
    expect(calls[0].data).toEqual({ leadId: "lead-1" });
    // jobId = lead id: a duplicate enqueue is a no-op while the record lives.
    expect(calls[0].opts.jobId).toBe("lead-1");
  });

  it("carries the retry policy that makes the failed set a DEAD-LETTER set", async () => {
    const { queue, calls } = recordingQueue();
    await enqueueRfqSubmitted("lead-2", { getQueue: async () => queue });
    const opts = calls[0].opts;
    expect(opts.attempts).toBe(5);
    expect(opts.backoff).toEqual({ type: "exponential", delay: 5_000 });
    // The whole point: failures must SURVIVE for an operator to list and
    // re-drive. `removeOnFail: true` would silently discard them.
    expect(opts.removeOnFail).toBe(false);
    // …while completed jobs are bounded so the instance does not grow forever.
    expect(opts.removeOnComplete).toEqual({ age: 24 * 3600, count: 1000 });
  });

  it("the queue and job names are the single shipped pair", () => {
    // Story 1.1's stub promised a second `email.send` queue that never
    // existed; one name, asserted, is what keeps that promise deleted.
    expect(RFQ_QUEUE_NAME).toBe("rfq.submitted");
    expect(RFQ_JOB_NAME).toBe("rfq.submitted");
    expect(RFQ_JOB_OPTIONS.attempts).toBe(5);
  });
});

describe("enqueueRfqSubmitted — failure is never an error (AC2)", () => {
  it("a queue that THROWS yields enqueued:false and a coded log, never a rejection", async () => {
    const result = await enqueueRfqSubmitted("lead-3", {
      getQueue: async () => ({
        add: async () => {
          throw new Error("ECONNREFUSED 127.0.0.1:6380");
        },
      }),
    });
    expect(result).toEqual({ enqueued: false });
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[rfq-queue]"),
      expect.anything(),
    );
  });

  it("a getQueue that THROWS is absorbed too", async () => {
    const result = await enqueueRfqSubmitted("lead-4", {
      getQueue: async () => {
        throw new Error("connection refused");
      },
    });
    expect(result).toEqual({ enqueued: false });
  });

  it("a NULL queue (unreachable) yields enqueued:false", async () => {
    const result = await enqueueRfqSubmitted("lead-5", { getQueue: async () => null });
    expect(result).toEqual({ enqueued: false });
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[rfq-queue]"));
  });

  it("A QUEUE THAT NEVER ANSWERS is bounded by the timeout — the hang-catcher", async () => {
    // The trap this exists for: ioredis retries forever by default, so an
    // unbounded enqueue against a dead queue does not fail — it HANGS, holding
    // the request open and turning "fail open" into "fail closed". The bound
    // is INJECTED (30ms) rather than waiting out the 500ms default, so the
    // test pins the mechanism instead of the constant.
    const start = Date.now();
    const result = await enqueueRfqSubmitted("lead-6", {
      getQueue: async () => ({ add: () => new Promise(() => {}) }),
      timeoutMs: 30,
    });
    expect(result).toEqual({ enqueued: false });
    expect(Date.now() - start).toBeLessThan(2_000);
  });

  it("a getQueue that never resolves is bounded by the SAME timeout", async () => {
    // Both awaits are raced, not just the add — acquiring the client is its own
    // opportunity to hang.
    const result = await enqueueRfqSubmitted("lead-7", {
      getQueue: () => new Promise(() => {}),
      timeoutMs: 30,
    });
    expect(result).toEqual({ enqueued: false });
  });
});

describe("configuration is a choice, not an outage (AC3)", () => {
  const saved = process.env.REDIS_QUEUE_URL;

  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_QUEUE_URL;
    else process.env.REDIS_QUEUE_URL = saved;
  });

  it("isQueueConfigured reads REDIS_QUEUE_URL, never REDIS_URL", () => {
    // Reading the cache URL here would point the queue at the instance whose
    // documented pre-proof ritual is FLUSHALL — destroying queued inquiries.
    process.env.REDIS_QUEUE_URL = "";
    expect(isQueueConfigured()).toBe(false);
    process.env.REDIS_QUEUE_URL = "   ";
    expect(isQueueConfigured()).toBe(false);
    process.env.REDIS_QUEUE_URL = "redis://localhost:6380";
    expect(isQueueConfigured()).toBe(true);
  });

  it("unconfigured is SILENT in development and yields enqueued:false", async () => {
    delete process.env.REDIS_QUEUE_URL;
    const result = await enqueueRfqSubmitted("lead-8");
    expect(result).toEqual({ enqueued: false });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("unconfigured is LOUD in production — shipping without a queue must not be invisible", async () => {
    delete process.env.REDIS_QUEUE_URL;
    // `vi.stubEnv` and NOT a direct assignment: `NODE_ENV` is typed read-only
    // under this tsconfig, and stubEnv restores it for us.
    vi.stubEnv("NODE_ENV", "production");
    try {
      await enqueueRfqSubmitted("lead-9");
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("RFQ emails are DISABLED"));
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
