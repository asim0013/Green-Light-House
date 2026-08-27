import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enqueueRfqSubmitted,
  getRfqQueue,
  isQueueConfigured,
  resetRfqQueueForTests,
  setQueueFactoryForTests,
  RFQ_JOB_NAME,
  RFQ_JOB_OPTIONS,
  RFQ_QUEUE_NAME,
  type QueueHandle,
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
    // The code is asserted EXACTLY, not by prefix. `throttledError` keys its
    // 30s window on the code alone, so a shared code lets one failure class
    // swallow another's line — the 3.7a lesson. Pinning the code is what keeps
    // the split honest.
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[rfq-queue-enqueue]"),
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
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("[rfq-queue-enqueue]"));
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

describe("the memo outliving its client — Story 3.3 review, 5 lenses", () => {
  /**
   * ⚠️ THIS BLOCK EXISTS BECAUSE EVERY OTHER TEST IN THIS FILE INJECTS
   * `getQueue`, WHICH MEANS `getRfqQueue` HAD ZERO COVERAGE. Deleting the memo
   * bookkeeping outright reddened nothing. The defect that shipped through the
   * hole: `retryStrategy: () => null` makes the ioredis client give up
   * PERMANENTLY, and the memo was cleared only for a connect that failed to be
   * born — so one queue restart disabled RFQ email for the life of the process.
   *
   * The factory seam is the minimum needed to drive the real `getRfqQueue`
   * without a live queue container (which is frequently not running, and which
   * `.env` would point us at).
   */
  const saved = process.env.REDIS_QUEUE_URL;

  /** A client whose lifecycle we control, mirroring ioredis's `status`. */
  function fakeHandle(status = "ready") {
    const connection = {
      status,
      disconnected: false,
      disconnect() {
        this.disconnected = true;
      },
    };
    const handle: QueueHandle = {
      queue: { add: async () => ({ id: "x" }) },
      connection: connection as unknown as QueueHandle["connection"],
    };
    return { handle, connection };
  }

  beforeEach(() => {
    process.env.REDIS_QUEUE_URL = "redis://localhost:6380";
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.REDIS_QUEUE_URL;
    else process.env.REDIS_QUEUE_URL = saved;
  });

  it("memoizes while the client is READY — one connect, not one per call", async () => {
    let built = 0;
    const { handle } = fakeHandle("ready");
    setQueueFactoryForTests(async () => {
      built++;
      return handle;
    });

    const first = await getRfqQueue();
    const second = await getRfqQueue();

    expect(built).toBe(1);
    expect(first).toBe(second);
    expect(first).toBe(handle.queue);
  });

  it("REBUILDS once the memoized client has died — the recovery path", async () => {
    // The whole finding in one assertion. Under the shipped code this returned
    // the dead client's queue forever and `built` stayed at 1.
    let built = 0;
    const handles = [fakeHandle("ready"), fakeHandle("ready")];
    setQueueFactoryForTests(async () => handles[built++].handle);

    const first = await getRfqQueue();
    expect(built).toBe(1);

    // ioredis reaches "end" when `retryStrategy` gives up — the terminal state
    // that made the death permanent.
    handles[0].connection.status = "end";

    const second = await getRfqQueue();
    expect(built).toBe(2);
    expect(second).not.toBe(first);
    expect(second).toBe(handles[1].handle.queue);
    // The corpse is released rather than leaked.
    expect(handles[0].connection.disconnected).toBe(true);
  });

  it("an enqueue AFTER the client dies still lands — the property that matters", async () => {
    // Stated in the currency FR29 cares about: not "a new object was built" but
    // "the buyer's inquiry email is not lost".
    let built = 0;
    const handles = [fakeHandle("ready"), fakeHandle("ready")];
    const added: string[] = [];
    for (const h of handles) {
      // ⚠️ THE FAKE MUST DIE WHEN THE CLIENT DIES. A queue that keeps accepting
      // `add` after its connection reaches "end" makes this test green under
      // the very defect it is written to catch — which is what it did on its
      // first P5 run. Real behaviour: `enableOfflineQueue: false` means a
      // command issued on a dead client REJECTS rather than buffering.
      h.handle.queue = {
        add: async (_name, data) => {
          if (h.connection.status !== "ready") {
            throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
          }
          added.push(data.leadId);
        },
      };
    }
    setQueueFactoryForTests(async () => handles[built++].handle);

    await enqueueRfqSubmitted("lead-alive");
    handles[0].connection.status = "end";
    const after = await enqueueRfqSubmitted("lead-after-outage");

    expect(after).toEqual({ enqueued: true });
    expect(added).toEqual(["lead-alive", "lead-after-outage"]);
  });

  it("a client that never becomes ready is not memoized as a corpse", async () => {
    let built = 0;
    setQueueFactoryForTests(async () => {
      built++;
      throw new Error("ECONNREFUSED 127.0.0.1:6380");
    });

    expect(await getRfqQueue()).toBeNull();
    expect(await getRfqQueue()).toBeNull();
    // Failure-cleared: every caller retries rather than inheriting one refusal.
    expect(built).toBe(2);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[rfq-queue-unreachable]"),
      expect.anything(),
    );
  });

  it("a teardown that THROWS cannot break the never-throws contract", async () => {
    // `redis.ts` records that destroying an already-closed client throws. The
    // same hazard, the same guard.
    let built = 0;
    const handles = [fakeHandle("ready"), fakeHandle("ready")];
    handles[0].connection.disconnect = () => {
      throw new Error("Connection is closed.");
    };
    setQueueFactoryForTests(async () => handles[built++].handle);

    await getRfqQueue();
    handles[0].connection.status = "end";

    await expect(getRfqQueue()).resolves.toBe(handles[1].handle.queue);
  });
});

describe("the enqueue bound is ONE budget, not one per await (AC2)", () => {
  it("a slow client acquisition eats into the add's share of the timeout", async () => {
    // ⚠️ The arithmetic the review caught. The original gave BOTH
    // `withTimeout` calls the full budget, so the advertised ≤500 ms worst case
    // was really ~1000 ms. Here: acquiring takes 160 ms of a 200 ms budget, and
    // the add then hangs forever. Sharing one deadline bounds the whole call at
    // ~200 ms; the per-await form would run ~360 ms.
    const start = Date.now();
    const result = await enqueueRfqSubmitted("lead-budget", {
      getQueue: async () => {
        await new Promise((r) => setTimeout(r, 160));
        return { add: () => new Promise(() => {}) };
      },
      timeoutMs: 200,
    });
    const elapsed = Date.now() - start;

    expect(result).toEqual({ enqueued: false });
    expect(elapsed).toBeLessThan(300);
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
