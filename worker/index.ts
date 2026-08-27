import IORedis from "ioredis";
import { Queue, Worker, type Job } from "bullmq";
import { createEmailTransport } from "@/lib/email";
import { RFQ_QUEUE_NAME } from "@/lib/queue";
import { handleJob, registerSweepScheduler } from "@/server/queue/worker-runtime";
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

if (!QUEUE_URL) {
  // Refusing to start is correct here, unlike in the request path: a worker
  // with no queue has nothing to do, and idling silently would look healthy
  // while every inquiry email went unsent.
  console.error("[worker] REDIS_QUEUE_URL is not set — refusing to start");
  process.exit(1);
}

const transport = createEmailTransport();

/**
 * ⚠️ A PRODUCTION WORKER ON A NON-DELIVERING TRANSPORT REFUSES TO START, for
 * exactly the reason the queue check above refuses: it would look healthy while
 * every inquiry email went unsent.
 *
 * `createEmailTransport` falls back to `log` for an unset, empty or misspelled
 * `EMAIL_PROVIDER`, and `.env.example` ships `log` as the template value. Story
 * 3.3's review found that a worker in that state printed one boot line and then
 * processed every job to a clean `sent` — the send flow now refuses to stamp
 * such a send (`transport.delivers`), but a running worker that can only ever
 * record `unconfigured` is still not a worker. Dev and CI are untouched: the
 * gate is NODE_ENV, and CI pins `EMAIL_PROVIDER=memory` under NODE_ENV=test.
 */
if (process.env.NODE_ENV === "production" && !transport.delivers) {
  console.error(
    `[worker] EMAIL_PROVIDER=${process.env.EMAIL_PROVIDER ?? "(unset)"} in production` +
      " — this transport delivers nothing. Refusing to start.",
  );
  process.exit(1);
}

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
    // The routing, the final-attempt arithmetic and the sweep all live in
    // `@/server/queue/worker-runtime` — inside `src/`, where vitest can reach
    // them. Nothing under `worker/` is in vitest's include glob, which is why
    // AC11's mandated P5 was impossible to run before the 3.3 review.
    const result = await handleJob(job, { transport });

    if ("retry" in result && result.retry) {
      // Throwing is BullMQ's ONLY retry signal, which is why the flow returns a
      // value and the translation happens here at the edge — keeping the send
      // flow testable without a queue.
      throw new Error(
        `[worker] delivery incomplete for ${(job.data as { leadId?: string }).leadId}` +
          ` (notify=${result.notify} confirm=${result.confirm})`,
      );
    }
    return result;
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
 * Own the scheduler's Queue handle and its lifetime; the registration DECISION
 * — the id, the interval, the job name, and the swallow-on-failure rule — lives
 * in `@/server/queue/worker-runtime`, where it is asserted and P5-proven.
 */
async function registerSweep(): Promise<void> {
  const queue = new Queue(RFQ_QUEUE_NAME, { connection: schedulerConnection as never });
  try {
    await registerSweepScheduler(queue as unknown as Parameters<typeof registerSweepScheduler>[0]);
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
  await registerSweep();
  console.log("[worker] ready");
}

main().catch((error) => {
  console.error("[worker] failed to start:", error);
  process.exit(1);
});
