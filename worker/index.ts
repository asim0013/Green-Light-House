import IORedis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { createEmailTransport } from "@/lib/email";
import { RFQ_JOB_NAME, RFQ_QUEUE_NAME, type RfqJobData } from "@/lib/queue";
import { processRfqSubmitted } from "@/server/rfq/notify";
import { expireStalePendingScans } from "@/server/repositories/lead";
import { prisma } from "@/lib/db";

/**
 * The GREENLIGHTHOUSE worker (Story 3.3 — FR29).
 *
 * ⚠️ THIS FILE WAS A STUB UNTIL NOW, AND ITS STUB PROMISED THINGS THAT ARE NOT
 * TRUE. It advertised three responsibilities: `rfq.submitted`, a second
 * `email.send` queue, and "ClamAV attachment-scan orchestration". Only the
 * first survives. The scan moved INTO the request handler in Story 3.7b
 * (measured: a 15 MB INSTREAM answers in 502 ms cold, so the latency argument
 * for deferring it was false), and `email.send` never existed — one queue with
 * one job name needs no routing layer, so the promise is deleted rather than
 * carried forward for the next author to re-litigate. **The worker never
 * contacts clamd**, which is why its compose `depends_on: clamav` went too.
 *
 * THIN BY DESIGN. The actual send flow lives in `@/server/rfq/notify` so it can
 * be unit-tested with fakes and integration-tested through a real BullMQ Worker
 * — the same function both times. A processor written inline here would be
 * reachable only by standing up the whole runtime, which is how send logic ends
 * up shipped untested.
 *
 * TWO CLIENTS, TWO DIFFERENT CONFIGURATIONS, AND THE DIFFERENCE MATTERS:
 *  - The WORKER's connection uses `maxRetriesPerRequest: null`. BullMQ requires
 *    it for the blocking commands a worker parks on; anything else makes long
 *    blocking reads fail. It is the exact opposite of what the request-path
 *    producer wants (`@/lib/queue` bounds everything, because a hung enqueue
 *    holds a buyer's HTTP request open).
 *  - The SCHEDULER's queue handle is a separate client for the same instance.
 *
 * ⚠️ ioredis, NOT node-redis. `bullmq@6` ships no Redis client and declares
 * both as optional peers, so node-redis — already in this repo — looked like a
 * way to avoid a second client library. Measured against the live queue: a
 * node-redis-backed Worker PROCESSES jobs, but `waitUntilReady()` and `close()`
 * never settle, which would hang graceful shutdown and every test teardown.
 */

const QUEUE_URL = process.env.REDIS_QUEUE_URL?.trim();

/** How often the stuck-`pending` sweep runs (Story 3.7b's AC11, wired here). */
const SWEEP_SCHEDULER_ID = "attachment-sweep";
const SWEEP_JOB_NAME = "attachment.sweep";
const SWEEP_EVERY_MS = 60 * 60 * 1000;

if (!QUEUE_URL) {
  // Refusing to start is correct here, unlike in the request path: a worker
  // with no queue has nothing to do, and idling silently would look healthy
  // while every inquiry email went unsent.
  console.error("[worker] REDIS_QUEUE_URL is not set — refusing to start");
  process.exit(1);
}

const transport = createEmailTransport();
console.log(`[worker] starting — queue=${RFQ_QUEUE_NAME} transport=${transport.name}`);

/** The blocking connection BullMQ parks on. `maxRetriesPerRequest: null` is
 *  mandatory; a long-running worker SHOULD reconnect, so the retry strategy is
 *  left at ioredis's default rather than bounded. */
const workerConnection = new IORedis(QUEUE_URL, { maxRetriesPerRequest: null });
workerConnection.on("error", (error) => console.error("[worker] queue connection error:", error));

/** A second client for the scheduler's queue handle. */
const schedulerConnection = new IORedis(QUEUE_URL, { maxRetriesPerRequest: null });
schedulerConnection.on("error", (error) =>
  console.error("[worker] scheduler connection error:", error),
);

const worker = new Worker(
  RFQ_QUEUE_NAME,
  async (job: Job) => {
    if (job.name === SWEEP_JOB_NAME) {
      const expired = await expireStalePendingScans();
      return { swept: expired };
    }

    const { leadId } = job.data as RfqJobData;
    // BullMQ counts attempts from 1. The flow records a TERMINAL failure only
    // on the last one, so a reason column never flickers mid-retry.
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    const outcome = await processRfqSubmitted(leadId, { transport, isFinalAttempt });

    console.log(
      `[worker] ${RFQ_JOB_NAME} lead=${leadId} notify=${outcome.notify} confirm=${outcome.confirm}` +
        ` attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
    );

    if (outcome.retry) {
      // Throwing is BullMQ's ONLY retry signal, which is why the flow returns a
      // value and the translation happens here at the edge — keeping
      // `processRfqSubmitted` testable without a queue.
      throw new Error(
        `[worker] delivery incomplete for ${leadId} (notify=${outcome.notify} confirm=${outcome.confirm})`,
      );
    }
    return outcome;
  },
  { connection: workerConnection as never },
);

worker.on("failed", (job, error) => {
  console.error(
    `[worker] job ${job?.id ?? "?"} failed (attempt ${job?.attemptsMade}):`,
    error.message,
  );
});
worker.on("error", (error) => console.error("[worker] worker error:", error));

/**
 * The stuck-`pending` sweep (Story 3.3 Task 0 #2, an Asim decision).
 *
 * Story 3.7b shipped `expireStalePendingScans` with ZERO callers, honestly
 * documented as waiting for whatever first wrote `pending` asynchronously.
 * BullMQ v6's Job Schedulers are the ready-made slot: `upsertJobScheduler` is
 * idempotent, so restarting the worker re-registers rather than duplicating,
 * and the scheduled job flows through the SAME Worker above — no second
 * process, no cron container, no new infrastructure.
 *
 * Under today's synchronous scan nothing writes `pending`, so the sweep finds
 * zero rows. That is the point: the guarantee should not wait for the first
 * async writer to arrive and remember to wire it.
 */
async function registerSweepScheduler(): Promise<void> {
  const queue = new Queue(RFQ_QUEUE_NAME, { connection: schedulerConnection as never });
  try {
    await queue.upsertJobScheduler(
      SWEEP_SCHEDULER_ID,
      { every: SWEEP_EVERY_MS },
      {
        name: SWEEP_JOB_NAME,
        opts: { removeOnComplete: { count: 24 }, removeOnFail: { count: 24 } },
      },
    );
    console.log(`[worker] sweep scheduler registered (every ${SWEEP_EVERY_MS}ms)`);
  } catch (error) {
    // A failed registration must not stop the worker from sending email: the
    // sweep is housekeeping, and the GUARANTEE it supports is derived at read
    // time in `toLeadAttachmentView` rather than depending on this having run.
    console.error("[worker] sweep scheduler registration failed:", error);
  } finally {
    await queue.close().catch(() => {});
  }
}

/**
 * Graceful shutdown. The stub kept itself alive with a `setInterval`; a real
 * Worker holds the event loop itself, so that is gone. On SIGTERM the worker
 * stops accepting new jobs, lets in-flight ones finish, then releases Postgres
 * — a job killed mid-send is exactly the crash window that duplicates an email.
 */
async function shutdown(signal: string): Promise<void> {
  console.log(`[worker] ${signal} received — closing`);
  try {
    await worker.close();
    await schedulerConnection.quit();
    await prisma.$disconnect();
  } catch (error) {
    console.error("[worker] error during shutdown:", error);
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

/**
 * ⚠️ AN ASYNC `main()`, NOT TOP-LEVEL `await` — and this was found by RUNNING
 * the worker, not by any static gate. `package.json` declares no
 * `"type": "module"`, so tsx transforms this file to CJS, where esbuild rejects
 * top-level await outright ("Top-level await is currently not supported with
 * the cjs output format"). Typecheck, lint and the whole test suite passed
 * while the worker could not boot at all.
 */
async function main(): Promise<void> {
  await worker.waitUntilReady();
  await registerSweepScheduler();
  console.log("[worker] ready");
}

main().catch((error) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
