import { describe, it, expect, vi } from "vitest";
import { MemoryTransport } from "@/lib/email";
import {
  handleJob,
  isFinalAttempt,
  registerSweepScheduler,
  SWEEP_EVERY_MS,
  SWEEP_JOB_NAME,
  SWEEP_SCHEDULER_ID,
  type JobLike,
  type SchedulerQueueLike,
} from "./worker-runtime";

/**
 * The worker's decisions (Story 3.3 AC11, and Story 3.7b's sweep).
 *
 * ⚠️ THIS FILE COULD NOT HAVE EXISTED BEFORE THE 3.3 REVIEW. `vitest.config.mts`
 * includes `src/**` only, so every line of `worker/index.ts` was unreachable by
 * any test. AC11 mandated "P5: break the registration → the housekeeping test
 * reddens"; there was no housekeeping test, and no file could have imported the
 * code to write one. The story record presented the wiring as delivered anyway.
 * Extracting the decisions into `src/` is what makes the mandated proof possible
 * — and the worker entrypoint now runs this exact code, so the proof is of the
 * shipped path rather than a parallel copy.
 */

function job(over: Partial<JobLike> = {}): JobLike {
  return {
    name: "rfq.submitted",
    data: { leadId: "lead-1" },
    attemptsMade: 0,
    opts: { attempts: 5 },
    ...over,
  };
}

function fakeSchedulerQueue() {
  const calls: unknown[][] = [];
  const queue: SchedulerQueueLike = {
    upsertJobScheduler: async (...args: unknown[]) => {
      calls.push(args);
      return {};
    },
  };
  return { queue, calls };
}

describe("registerSweepScheduler (AC11's wiring half)", () => {
  it("registers the sweep under its stable id, hourly, with the routed job name", async () => {
    const { queue, calls } = fakeSchedulerQueue();
    const ok = await registerSweepScheduler(
      queue,
      () => {},
      () => {},
    );

    expect(ok).toBe(true);
    expect(calls).toHaveLength(1);
    const [id, repeat, template] = calls[0] as [string, { every: number }, { name: string }];
    // ⚠️ LITERALS, NOT THE CONSTANTS. Asserting `toBe(SWEEP_SCHEDULER_ID)`
    // compares the constant to itself and survives any rename — which is
    // exactly what the first P5 run on this file showed. Both values are WIRE
    // values: the queue instance is AOF-backed, so a scheduler registered under
    // the old id SURVIVES the deploy that renames it and keeps firing forever
    // against a name nobody routes, while the new one registers alongside it.
    // Pinning the strings makes that migration a red test rather than a slowly
    // growing Redis.
    expect(id).toBe("attachment-sweep");
    expect(SWEEP_SCHEDULER_ID).toBe("attachment-sweep");
    expect(repeat).toEqual({ every: 60 * 60 * 1000 });
    expect(SWEEP_EVERY_MS).toBe(60 * 60 * 1000);
    // The name is the routing key `handleJob` matches on below; a mismatch here
    // would fire the scheduler into the RFQ send path.
    expect(template.name).toBe("attachment.sweep");
    expect(SWEEP_JOB_NAME).toBe("attachment.sweep");
  });

  it("a registration failure is reported and SWALLOWED — email must still flow", async () => {
    // The sweep is housekeeping, and the guarantee it supports is derived at
    // read time. A worker that refused to send inquiry email because a cron
    // registration failed would trade a real obligation for a tidy one.
    const logError = vi.fn();
    const queue: SchedulerQueueLike = {
      upsertJobScheduler: async () => {
        throw new Error("READONLY You can't write against a read only replica.");
      },
    };

    const ok = await registerSweepScheduler(queue, () => {}, logError);

    expect(ok).toBe(false);
    expect(logError).toHaveBeenCalledOnce();
  });
});

describe("handleJob — the routing", () => {
  it("a sweep job runs the sweep and NEVER the send flow", async () => {
    const sweep = vi.fn(async () => 3);
    const process = vi.fn();
    const result = await handleJob(job({ name: SWEEP_JOB_NAME }), {
      transport: new MemoryTransport(),
      sweep,
      process: process as never,
      log: () => {},
    });

    expect(result).toEqual({ swept: 3 });
    expect(sweep).toHaveBeenCalledOnce();
    expect(process).not.toHaveBeenCalled();
  });

  it("an RFQ job runs the send flow and NEVER the sweep", async () => {
    const sweep = vi.fn(async () => 0);
    const process = vi.fn(async () => ({
      status: "sent" as const,
      notify: "sent" as const,
      confirm: "sent" as const,
      retry: false,
    }));

    const result = await handleJob(job(), {
      transport: new MemoryTransport(),
      sweep,
      process: process as never,
      log: () => {},
    });

    expect(sweep).not.toHaveBeenCalled();
    expect(process).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({ isFinalAttempt: false }),
    );
    expect(result).toMatchObject({ notify: "sent" });
  });
});

describe("isFinalAttempt — the arithmetic a terminal failure depends on", () => {
  it("is true on the LAST attempt and false before it", () => {
    // ⚠️ `>=`, NOT `>`. `attemptsMade` counts from 0, so the last of five
    // attempts has `attemptsMade === 4` and `4 + 1 === 5`. Under `>` the
    // condition could never be true at all, no terminal failure would ever be
    // recorded, and `deliveryFailureReason` would stay null forever — Story
    // 4.7 would show every dead-lettered lead as merely unsent.
    expect(isFinalAttempt(job({ attemptsMade: 0 }))).toBe(false);
    expect(isFinalAttempt(job({ attemptsMade: 3 }))).toBe(false);
    expect(isFinalAttempt(job({ attemptsMade: 4 }))).toBe(true);
  });

  it("treats a job with no explicit attempts as single-shot", () => {
    expect(isFinalAttempt(job({ attemptsMade: 0, opts: {} }))).toBe(true);
  });
});
