import type { Queue } from "bullmq";
import { throttledError } from "./redis";

/**
 * The RFQ job queue producer (Story 3.3 — FR29's decoupling half).
 *
 * THE DURABLE INSTANCE, NEVER THE CACHE ONE. This module reads
 * `REDIS_QUEUE_URL` (`:6380`, AOF-backed) and never `REDIS_URL`. The two are
 * separate instances on purpose: `FLUSHALL` is instance-wide and is a standing
 * pre-proof ritual in this project, so a shared instance would let a routine
 * cache flush destroy queued inquiries — precisely what FR29 forbids.
 * `npm run cache:flush` reads `REDIS_URL` only and can never reach this one.
 *
 * ⚠️ IOREDIS IS A DIRECT DEPENDENCY, AND THE STORY SAID OTHERWISE (Task 0 #5
 * expected it to arrive transitively with bullmq). MEASURED: `bullmq@6.3.0`
 * depends on cron-parser, msgpackr, node-abort-controller, semver and tslib —
 * no Redis client at all. It declares `ioredis`, `redis` and `pg` as OPTIONAL
 * peers and picks a driver structurally, so node-redis (already in this repo)
 * looked like a way to add zero new client libraries. It is not: measured
 * against the live queue, a node-redis-backed Worker PROCESSES jobs but its
 * `waitUntilReady()` and `close()` NEVER SETTLE — which would hang graceful
 * shutdown and every test teardown. ioredis resolves all four lifecycle calls
 * cleanly. Co-residency with node-redis was already sanctioned by Task 0 #5;
 * only the mechanism changed.
 *
 * THE DISCIPLINE, copied from `lib/redis.ts` because every element has drawn
 * blood here:
 *  - IMPORT-INERT: no env read and no client at module scope. The DB-free build
 *    imports the RFQ route with all four backing URLs blanked and must exit 0.
 *  - Unset/empty `REDIS_QUEUE_URL` ⇒ `null`, silently in dev (configuration,
 *    not an outage); loud ONCE per process in production, because shipping
 *    FR29's endpoint with no queue means every inquiry email is silently lost.
 *  - BOUNDED EVERYTHING. ⚠️ ioredis retries FOREVER by default — `retryStrategy`
 *    returning a delay forever is its documented default, which turns "fail
 *    open" into "hang forever", i.e. fail CLOSED. Every option below exists to
 *    stop that: no offline command queue, one retry per request, a connect
 *    timeout, and a `retryStrategy` that gives up.
 *  - The WORKER's client is deliberately NOT built here (see `worker/index.ts`):
 *    a blocking connection requires `maxRetriesPerRequest: null`, the exact
 *    opposite of what a request-path producer wants.
 *  - THE MEMO IS LIVENESS-CHECKED, not merely failure-cleared. A bounded client
 *    dies permanently by design, so a memo that outlives it disables RFQ email
 *    for the whole process. See `getRfqQueue`.
 */

/** The one queue this project has. Story 1.1's stub promised a second
 *  (`email.send`); it never existed and the promise is deleted — one queue,
 *  one job name, no routing layer to reason about. */
export const RFQ_QUEUE_NAME = "rfq.submitted";

/** The job name inside that queue. */
export const RFQ_JOB_NAME = "rfq.submitted";

/** What the job carries: the lead's id and NOTHING else. The worker re-reads
 *  the row, so a job that sat in the queue through a deploy still sends the
 *  current truth rather than a stale snapshot. */
export interface RfqJobData {
  leadId: string;
}

/** Retry policy (AC8). Five attempts with exponential backoff from 5s; the
 *  failed set is DURABLE (`removeOnFail: false`) and is the dead-letter set the
 *  operator scripts list and re-drive. ⚠️ `removeOnComplete` bounds the
 *  completed set — and with it the jobId-dedup window, since dedup lasts only
 *  while the job record exists. That is acceptable: the REAL exactly-once guard
 *  is the per-email DB short-circuit (`notifiedAt`/`confirmationSentAt`), so a
 *  re-enqueued lead is a no-op rather than a second email. */
export const RFQ_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: false,
} as const;

/** How long the request path will wait for an enqueue before giving up. */
const ENQUEUE_TIMEOUT_MS = 500;

/** True when `REDIS_QUEUE_URL` is set non-empty. A `null` queue while
 *  configured is an OUTAGE (log it); unconfigured `null` is a choice. */
export function isQueueConfigured(): boolean {
  return Boolean(process.env.REDIS_QUEUE_URL?.trim());
}

/** The minimal surface the producer needs — so tests inject a fake instead of
 *  standing up BullMQ (and instead of touching a live queue: vitest loads
 *  `.env`, and the local queue container is frequently not running). */
export interface RfqQueueLike {
  add(name: string, data: RfqJobData, opts: Record<string, unknown>): Promise<unknown>;
}

/**
 * The half of the client that `RfqQueueLike` deliberately hides.
 *
 * ⚠️ THE MEMO MUST BE ABLE TO ASK WHETHER ITS CLIENT IS STILL ALIVE, and a
 * queue handle cannot answer that — `add` is its whole surface. Story 3.3's
 * review found what that costs. `retryStrategy: () => null` means ioredis gives
 * up permanently, while the memo was cleared ONLY for a connect that failed to
 * be born; a client that died later stayed memoized forever. So one
 * `docker compose restart redis-queue`, one TCP reset, one idle drop disabled
 * RFQ email for the life of the process — SILENTLY, because
 * `enableOfflineQueue: false` makes every `add` reject and a rejected enqueue
 * is by design not an error. Five review lenses found it independently.
 */
export interface QueueConnectionLike {
  /** ioredis's own lifecycle field. `"ready"` is the only usable state; the
   *  terminal state after it gives up is `"end"`. (The sibling cache client in
   *  `lib/redis.ts` checks node-redis's `isReady` for the same purpose.) */
  readonly status: string;
  disconnect(): void;
}

/** What the memo actually holds: the producer AND the client under it. */
export interface QueueHandle {
  queue: RfqQueueLike;
  connection: QueueConnectionLike;
}

/**
 * How a handle is built — injectable ONLY so the memo logic below can be
 * tested.
 *
 * Every test in `queue.test.ts` injected `getQueue` instead, which meant
 * `getRfqQueue` and `connectOnce` had ZERO coverage. That is the blind spot the
 * dead-memo defect shipped through: deleting `retryStrategy: () => null`
 * reddened nothing, and neither did deleting the memo bookkeeping entirely.
 */
export type QueueFactory = (url: string) => Promise<QueueHandle>;

let memo: Promise<QueueHandle | null> | null = null;
let memoUrl: string | undefined;
let unconfiguredLogged = false;
let factoryOverride: QueueFactory | null = null;

const defaultFactory: QueueFactory = async (url) => {
  // Imported lazily so this module stays import-inert and the DB-free build
  // never pays for bullmq at all.
  const [{ Queue: BullQueue }, IORedisModule] = await Promise.all([
    import("bullmq"),
    import("ioredis"),
  ]);
  const IORedis = IORedisModule.default;

  const connection = new IORedis(url, {
    // Every one of these bounds a default that would otherwise hang the
    // request path. `enableOfflineQueue: false` is the important one: without
    // it, commands issued while disconnected are buffered forever rather
    // than failing, and the enqueue's own timeout becomes the only bound.
    //
    // `retryStrategy: () => null` STAYS. Bounding the client is correct — the
    // recovery belongs at the memo layer, not in ioredis. Relaxing it here
    // instead would be the wrong fix twice over: with `lazyConnect`, a
    // retrying strategy makes `connect()` hang rather than reject during a
    // connect-time outage, so every enqueue would pay the full timeout
    // forever, and a cleared memo would leak one background reconnect loop per
    // attempt.
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    connectTimeout: 2_000,
    retryStrategy: () => null,
  });
  // Without a listener, a socket error after connect is an unhandled 'error'
  // event that kills the process (the lib/redis.ts lesson). The code is
  // DISTINCT from the enqueue one: the throttle keys on the code alone, so a
  // shared code would let a connection storm swallow the enqueue-failure line
  // for a whole 30s window (the 3.7a review's lesson, applied here).
  connection.on("error", (error: Error) => {
    throttledError("rfq-queue-conn", "queue Redis connection error", error);
  });
  await connection.connect();
  const queue = new BullQueue(RFQ_QUEUE_NAME, {
    connection: connection as never,
  }) as unknown as RfqQueueLike;
  return { queue, connection };
};

async function connectOnce(url: string): Promise<QueueHandle | null> {
  try {
    return await (factoryOverride ?? defaultFactory)(url);
  } catch (error) {
    throttledError("rfq-queue-unreachable", "queue Redis unreachable — enqueue disabled", error);
    return null;
  }
}

/**
 * The lazy shared producer, or `null` (unconfigured OR unreachable). Never
 * throws.
 *
 * TWO WAYS THE MEMO IS CLEARED, AND BOTH ARE LOAD-BEARING:
 *  - A connect that FAILS is not memoized, so the next caller retries.
 *  - A memoized client that has since DIED is discarded and rebuilt, exactly as
 *    `getCacheRedis` does in `lib/redis.ts`. Until Story 3.3's review this half
 *    was missing while the docstring claimed it, which made "a queue coming
 *    back mid-outage is the normal recovery path" false for every outage except
 *    one that began before the first enqueue.
 */
export async function getRfqQueue(): Promise<RfqQueueLike | null> {
  const url = process.env.REDIS_QUEUE_URL?.trim();
  if (!url) return null;

  if (memo && memoUrl === url) {
    const existing = await memo;
    if (existing && existing.connection.status === "ready") return existing.queue;
    // Dead or failed — clear and fall through to a fresh attempt.
    memo = null;
    if (existing) {
      // Guarded for the same reason `redis.ts` guards `destroy()`: tearing down
      // an already-closed client throws, and this function must never throw.
      try {
        existing.connection.disconnect();
      } catch {
        // already closed
      }
    }
  }

  memoUrl = url;
  const attempt = connectOnce(url).then((handle) => {
    if (!handle) memo = null; // failure-cleared: the next caller retries
    return handle;
  });
  memo = attempt;
  return (await attempt)?.queue ?? null;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("enqueue timed out")), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface EnqueueResult {
  /** True only when the job is durably in the queue. */
  enqueued: boolean;
}

/**
 * Enqueue `rfq.submitted` for one lead (AC1/AC2). AWAITED but BOUNDED, and it
 * NEVER THROWS.
 *
 * WHY AWAITED, given the AC says the request path "never awaits a send": that
 * clause governs the EMAIL, not the enqueue. This route already awaits a
 * bounded fail-open Redis operation on every request (the 3.7a limiter), so the
 * shape is established and its cost is a known worst case of ENQUEUE_TIMEOUT_MS
 * — 500 ms for the WHOLE call, acquiring the client and adding the job, because
 * both awaits share one deadline. Fire-and-forget would make enqueue completion
 * untestable and turn any rejection into an unhandled promise, which in Node is
 * a process-level risk.
 *
 * FAILURE IS NOT AN ERROR HERE. A lead is already committed by the time this
 * runs; losing the email is bad, losing the lead is unacceptable (FR29). So an
 * unreachable queue yields `{ enqueued: false }` plus one throttled coded line,
 * the route answers 201 as always, and the row's null send-state columns make
 * it findable by `npm run queue:replay`.
 *
 * `jobId` is the lead id, which makes a duplicate enqueue of the same lead a
 * no-op for as long as the job record lives — belt to the DB short-circuit's
 * braces.
 */
export async function enqueueRfqSubmitted(
  leadId: string,
  options: { getQueue?: () => Promise<RfqQueueLike | null>; timeoutMs?: number } = {},
): Promise<EnqueueResult> {
  const getQueue = options.getQueue ?? getRfqQueue;
  const timeoutMs = options.timeoutMs ?? ENQUEUE_TIMEOUT_MS;

  if (!options.getQueue && !isQueueConfigured()) {
    // Configuration, not an outage — but in production it means every RFQ
    // email is silently not being sent, which must never be invisible.
    if (process.env.NODE_ENV === "production" && !unconfiguredLogged) {
      unconfiguredLogged = true;
      throttledError("rfq-queue-off", "no REDIS_QUEUE_URL — RFQ emails are DISABLED");
    }
    return { enqueued: false };
  }

  // ONE DEADLINE FOR THE WHOLE OPERATION, not one per await. ⚠️ The original
  // gave each of the two sequential `withTimeout` calls the FULL budget, so the
  // "≤500 ms worst case" this function advertises — and the AC2 bound it was
  // written to satisfy — was really ~1000 ms. Story 3.3's review caught the
  // arithmetic in three places. Both awaits now draw from the same clock.
  const deadline = Date.now() + timeoutMs;
  const remaining = () => Math.max(0, deadline - Date.now());

  try {
    const queue = await withTimeout(getQueue(), remaining());
    if (!queue) {
      throttledError("rfq-queue-enqueue", "enqueue skipped — no queue client");
      return { enqueued: false };
    }
    await withTimeout(
      queue.add(RFQ_JOB_NAME, { leadId }, { ...RFQ_JOB_OPTIONS, jobId: leadId }),
      remaining(),
    );
    return { enqueued: true };
  } catch (error) {
    throttledError("rfq-queue-enqueue", "enqueue failed — lead kept, email deferred", error);
    return { enqueued: false };
  }
}

/** Test/script seam: drop the memoized producer so the next call reconnects.
 *  Also clears any injected factory, so one test cannot leak its fake client
 *  into the next file's real one. */
export function resetRfqQueueForTests(): void {
  memo = null;
  memoUrl = undefined;
  unconfiguredLogged = false;
  factoryOverride = null;
}

/**
 * Test seam: build handles with `factory` instead of bullmq+ioredis.
 *
 * This is what makes the memo's liveness check provable without a live queue.
 * Cleared by `resetRfqQueueForTests`, which every test in `queue.test.ts` calls
 * in `beforeEach`.
 */
export function setQueueFactoryForTests(factory: QueueFactory | null): void {
  factoryOverride = factory;
  memo = null;
  memoUrl = undefined;
}

export type { Queue };
