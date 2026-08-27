import { createEmailTransport, type EmailTransport } from "@/lib/email";
import { RFQ_JOB_NAME, RFQ_QUEUE_NAME, type RfqJobData } from "@/lib/queue";
import { processRfqSubmitted, type NotifyOutcome } from "@/server/rfq/notify";
import { expireStalePendingScans } from "@/server/repositories/lead";

/**
 * The worker's DECISIONS, extracted from `worker/index.ts` (Story 3.3 review).
 *
 * ⚠️ WHY THIS FILE EXISTS: `vitest.config.mts` includes `src/**` and NOTHING
 * ELSE, so nothing under `worker/` has ever been reachable by a test. AC11
 * mandated a P5 on the sweep-scheduler registration — "break the registration →
 * the housekeeping test reddens" — and that proof was impossible to run,
 * because there was no test file that could import the code and no way to add
 * one. The story record nonetheless presented the wiring as delivered. The
 * review found it; this is the fix.
 *
 * What stays in `worker/index.ts`: reading the environment, refusing to start,
 * constructing the two ioredis clients, wiring signal handlers, `main()`. Those
 * are process concerns with nothing to assert. What moved here: which job name
 * routes where, the final-attempt arithmetic, and what the scheduler is
 * registered with — every one of which is a decision that can be wrong.
 */

/** The scheduler's stable id. `upsertJobScheduler` is keyed on it, which is what
 *  makes a worker restart re-register rather than duplicate. */
export const SWEEP_SCHEDULER_ID = "attachment-sweep";

/** The job name the sweep arrives under, routed by `handleJob` below. */
export const SWEEP_JOB_NAME = "attachment.sweep";

/** How often the stuck-`pending` sweep runs (Story 3.7b's AC11, wired here). */
export const SWEEP_EVERY_MS = 60 * 60 * 1000;

/** The `Queue` surface the registration needs — so a test needs no BullMQ and
 *  no live Redis to prove what gets registered. */
export interface SchedulerQueueLike {
  upsertJobScheduler(
    id: string,
    repeat: { every: number },
    template: { name: string; opts?: Record<string, unknown> },
  ): Promise<unknown>;
}

/** The `Job` surface `handleJob` reads. */
export interface JobLike {
  name: string;
  data: unknown;
  attemptsMade: number;
  opts: { attempts?: number };
}

export interface HandleJobDeps {
  transport: EmailTransport;
  /** Injected so the routing test needs neither Prisma nor a mail provider. */
  process?: typeof processRfqSubmitted;
  sweep?: typeof expireStalePendingScans;
  log?: (message: string) => void;
}

/**
 * Register the hourly stuck-`pending` sweep.
 *
 * Story 3.7b shipped `expireStalePendingScans` with ZERO callers, honestly
 * documented as waiting for whatever first wrote `pending` asynchronously.
 * BullMQ v6's Job Schedulers are the ready-made slot: `upsertJobScheduler` is
 * idempotent, so restarting the worker re-registers rather than duplicating,
 * and the scheduled job flows through the SAME Worker — no second process, no
 * cron container, no new infrastructure.
 *
 * A failed registration must NOT stop the worker from sending email: the sweep
 * is housekeeping, and the guarantee it supports is derived at read time in
 * `toLeadAttachmentView` rather than depending on this having run. So the
 * failure is reported and swallowed, and the boolean says which happened.
 */
export async function registerSweepScheduler(
  queue: SchedulerQueueLike,
  log: (message: string) => void = console.log,
  logError: (message: string, error: unknown) => void = console.error,
): Promise<boolean> {
  try {
    await queue.upsertJobScheduler(
      SWEEP_SCHEDULER_ID,
      { every: SWEEP_EVERY_MS },
      {
        name: SWEEP_JOB_NAME,
        opts: { removeOnComplete: { count: 24 }, removeOnFail: { count: 24 } },
      },
    );
    log(`[worker] sweep scheduler registered (every ${SWEEP_EVERY_MS}ms)`);
    return true;
  } catch (error) {
    logError("[worker] sweep scheduler registration failed:", error);
    return false;
  }
}

/** What `handleJob` returns, so the caller at the edge can decide to throw. */
export type JobResult = { swept: number } | NotifyOutcome;

/** True when this is the LAST attempt BullMQ will make. */
export function isFinalAttempt(job: JobLike): boolean {
  // ⚠️ BullMQ counts attempts from 0 in `attemptsMade`, so the attempt NUMBER is
  // `attemptsMade + 1` and the last one equals `opts.attempts`. `>=`, not `>`:
  // with `attempts: 5` the final attempt has `attemptsMade === 4`, giving 5, and
  // `5 > 5` is false — under which a terminal failure would NEVER be recorded
  // and `deliveryFailureReason` would stay null forever.
  return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}

/**
 * Route one job. The sweep and the RFQ send share a queue and are told apart by
 * name — the only routing this project has, and previously untestable.
 */
export async function handleJob(job: JobLike, deps: HandleJobDeps): Promise<JobResult> {
  const run = deps.process ?? processRfqSubmitted;
  const sweep = deps.sweep ?? expireStalePendingScans;
  const log = deps.log ?? console.log;

  if (job.name === SWEEP_JOB_NAME) {
    return { swept: await sweep() };
  }

  const { leadId } = job.data as RfqJobData;
  const outcome = await run(leadId, {
    transport: deps.transport,
    isFinalAttempt: isFinalAttempt(job),
  });

  log(
    `[worker] ${RFQ_JOB_NAME} lead=${leadId} notify=${outcome.notify} confirm=${outcome.confirm}` +
      ` attempt=${job.attemptsMade + 1}/${job.opts.attempts ?? 1}`,
  );

  return outcome;
}

/**
 * A production worker on a transport that delivers nothing must not start: it
 * would look healthy while every inquiry email went unsent, which is the same
 * reason a worker with no queue refuses.
 */
export function transportIsUsable(transport = createEmailTransport()): boolean {
  return process.env.NODE_ENV !== "production" || transport.delivers;
}

export { RFQ_QUEUE_NAME };
