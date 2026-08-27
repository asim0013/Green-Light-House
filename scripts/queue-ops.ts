import IORedis from "ioredis";
import { Queue } from "bullmq";
import { RFQ_JOB_NAME, RFQ_JOB_OPTIONS, RFQ_QUEUE_NAME } from "../src/lib/queue";
import { findLeadsAwaitingNotification } from "../src/server/repositories/lead";
import { prisma } from "../src/lib/db";

/**
 * Operator tools for the RFQ queue (Story 3.3, AC10).
 *
 *   npm run queue:failed   — list the dead-letter set
 *   npm run queue:retry    — re-drive every failed job
 *   npm run queue:replay   — re-enqueue leads whose enqueue never landed
 *
 * WHY THESE EXIST. The epics require that an exhausted job "lands in a
 * dead-letter set an operator can list and replay", and that a lead whose
 * enqueue failed "remains in a state a later replay can pick up". Both are
 * only true if something can actually do the listing and the replaying —
 * otherwise the ACs describe a property of Redis rather than a capability of
 * this project.
 *
 * ⚠️ EVERY CONNECTION HERE IS BOUNDED. ioredis retries forever by default, so
 * an operator running these against a down queue would get a hung terminal
 * rather than an error — the same trap the request-path producer bounds. These
 * fail fast and say so.
 *
 * ⚠️ These need `.env`, and `tsx` does NOT load it (measured). The npm scripts
 * invoke them as `node --env-file=.env --import tsx …`, which does.
 */

const QUEUE_URL = process.env.REDIS_QUEUE_URL?.trim();

/** Leads younger than this are still legitimately in flight. */
const REPLAY_MIN_AGE_MS = 5 * 60 * 1000;

/**
 * …and leads OLDER than this are not replayed automatically.
 *
 * AC10 asks this command to "skip nothing silently". The floor alone left no
 * ceiling, so a first run against a database with months of history would mail
 * every buyer who ever submitted an inquiry that was never notified — a
 * confirmation quoting a reference from last quarter is worse than no email.
 * These are LISTED, never sent, so an operator decides.
 */
const REPLAY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function requireQueueUrl(): string {
  if (!QUEUE_URL) {
    console.error(
      "REDIS_QUEUE_URL is not set. Copy it from .env.example (redis://localhost:6380) and start the\n" +
        "container with `docker compose up -d redis-queue`.",
    );
    process.exit(1);
  }
  return QUEUE_URL;
}

function connect(url: string): IORedis {
  const client = new IORedis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    // Give up rather than hanging an operator's terminal forever.
    retryStrategy: () => null,
  });
  client.on("error", () => {});
  return client;
}

async function withQueue<T>(fn: (queue: Queue) => Promise<T>): Promise<T> {
  const connection = connect(requireQueueUrl());
  const queue = new Queue(RFQ_QUEUE_NAME, { connection: connection as never });
  try {
    return await fn(queue);
  } finally {
    await queue.close().catch(() => {});
    connection.disconnect();
  }
}

/** `queue:failed` — the dead-letter listing. Touches Postgres now (to resolve
 *  references), so it must release the pool the way `queue:replay` does or the
 *  operator's terminal never returns. */
export async function listFailed(): Promise<void> {
  try {
    await listFailedInner();
  } finally {
    await prisma.$disconnect();
  }
}

async function listFailedInner(): Promise<void> {
  await withQueue(async (queue) => {
    const jobs = await queue.getFailed(0, 100);
    if (jobs.length === 0) {
      console.log("[queue:failed] no failed jobs.");
      return;
    }
    console.log(`[queue:failed] ${jobs.length} job(s) in the dead-letter set:\n`);
    // AC10 asks the listing to identify leads by their REFERENCE — the handle
    // the buyer saw on screen and quotes in email — not by the internal id. The
    // job carries only the id, so the references are looked up in one query
    // rather than one per job.
    const ids = jobs.map((job) => (job.data as { leadId?: string }).leadId).filter(Boolean);
    const rows = ids.length
      ? await prisma.lead.findMany({
          where: { id: { in: ids as string[] } },
          select: { id: true, reference: true },
        })
      : [];
    const referenceOf = new Map(rows.map((row) => [row.id, row.reference]));
    for (const job of jobs) {
      const leadId = (job.data as { leadId?: string }).leadId;
      // A deleted lead still has a job; `?` beats crashing the listing.
      const reference = leadId ? (referenceOf.get(leadId) ?? "?") : "?";
      console.log(
        `  job=${job.id} lead=${reference} (id=${leadId ?? "?"}) attempts=${job.attemptsMade}` +
          ` reason=${job.failedReason ?? "?"}`,
      );
    }
    console.log("\nRe-drive them with: npm run queue:retry");
  });
}

/** `queue:retry` — re-drive everything in the dead-letter set. */
export async function retryFailed(): Promise<void> {
  await withQueue(async (queue) => {
    const jobs = await queue.getFailed(0, 1000);
    if (jobs.length === 0) {
      console.log("[queue:retry] nothing to retry.");
      return;
    }
    let retried = 0;
    for (const job of jobs) {
      try {
        await job.retry();
        retried++;
      } catch (error) {
        // Reported, never swallowed: a job that cannot be retried is exactly
        // what an operator running this needs to know about.
        console.error(`  job=${job.id} could not be retried:`, error);
      }
    }
    console.log(`[queue:retry] re-drove ${retried}/${jobs.length} job(s).`);
  });
}

/**
 * `queue:replay` — the ENQUEUE-failure recovery.
 *
 * Finds leads that were committed but never successfully emailed and are older
 * than the age floor: `notifiedAt` null, and a failure reason that is either
 * absent or `notify:unconfigured` (which means "we never tried" — see
 * `findLeadsAwaitingNotification`). A genuine terminal failure (`provider`,
 * `transport`) writes a reason and belongs to `queue:retry`, not here.
 *
 * ⚠️ THE PREVIOUS VERSION OF THIS DOCSTRING WAS FALSE IN BOTH HALVES, and five
 * lenses caught it. It claimed every non-null reason belongs to `queue:retry`,
 * but an `unconfigured` job COMPLETES rather than failing, so it never reaches
 * the failed set and no operator command could see it at all. And the loop
 * below counted a lead as "enqueued" whenever `queue.add` did not throw — but
 * `add` with an existing `jobId` silently returns the EXISTING job, so a lead
 * whose previous job was still in the completed or failed set was reported
 * re-driven while nothing was queued. Both are fixed below.
 *
 * SAFE AGAINST DOUBLE-SENDING by construction: the worker's per-email
 * short-circuit reads the stamps, so re-enqueueing a lead that was in fact
 * already emailed sends nothing.
 */
export async function replayUnnotified(): Promise<void> {
  const now = Date.now();
  const cutoff = new Date(now - REPLAY_MIN_AGE_MS);
  const floor = new Date(now - REPLAY_MAX_AGE_MS);
  const found = await findLeadsAwaitingNotification(cutoff);

  // Reported, never sent — and reported BEFORE the count, so "skip nothing
  // silently" holds for the ones the ceiling excludes too.
  const tooOld = found.filter((lead) => lead.createdAt < floor);
  const leads = found.filter((lead) => lead.createdAt >= floor);
  if (tooOld.length > 0) {
    console.warn(
      `[queue:replay] ${tooOld.length} lead(s) older than ${REPLAY_MAX_AGE_MS / 86_400_000} days` +
        ` NOT replayed — mailing a months-old reference would confuse the buyer more than silence.` +
        ` Re-drive deliberately if you want them: ${tooOld
          .slice(0, 10)
          .map((lead) => lead.reference)
          .join(", ")}`,
    );
  }

  if (leads.length === 0) {
    console.log("[queue:replay] no leads awaiting notification.");
    await prisma.$disconnect();
    return;
  }

  console.log(`[queue:replay] ${leads.length} lead(s) awaiting notification:`);
  for (const lead of leads) {
    console.log(`  ${lead.reference} (id=${lead.id}, created ${lead.createdAt.toISOString()})`);
  }

  await withQueue(async (queue) => {
    let enqueued = 0;
    let alreadyQueued = 0;
    let failed = 0;
    for (const lead of leads) {
      try {
        // ⚠️ `jobId` DEDUP MAKES A BARE `add` A SILENT NO-OP. `RFQ_JOB_OPTIONS`
        // keeps completed jobs for 24 h and failed ones forever, so the lead's
        // previous job record is usually still there — and BullMQ answers a
        // duplicate `jobId` by returning that existing job rather than queueing
        // anything or throwing. The old loop incremented on exactly that.
        const existing = await queue.getJob(lead.id);
        if (existing) {
          const state = await existing.getState();
          if (state === "completed" || state === "failed") {
            // A finished record, kept only for history — it is what blocks the
            // re-add, so remove it and queue the lead for real.
            await existing.remove();
          } else {
            // waiting / active / delayed: genuinely in the queue already.
            // Re-adding would be the no-op; saying so is the honest report.
            console.log(`  ${lead.reference} already queued (state=${state}) — left alone`);
            alreadyQueued++;
            continue;
          }
        }
        await queue.add(RFQ_JOB_NAME, { leadId: lead.id }, { ...RFQ_JOB_OPTIONS, jobId: lead.id });
        enqueued++;
      } catch (error) {
        failed++;
        console.error(`  ${lead.reference} could not be enqueued:`, error);
      }
    }
    // Never silently partial, and never counting a dedup as a delivery: the
    // three numbers must add up to the number of leads listed above.
    console.log(
      `[queue:replay] enqueued ${enqueued}/${leads.length}` +
        ` (already queued: ${alreadyQueued}, failed: ${failed}).`,
    );
  });
  await prisma.$disconnect();
}

const COMMANDS: Record<string, () => Promise<void>> = {
  failed: listFailed,
  retry: retryFailed,
  replay: replayUnnotified,
};

const command = process.argv[2];
const run = command ? COMMANDS[command] : undefined;
if (!run) {
  console.error(`Usage: queue-ops <${Object.keys(COMMANDS).join("|")}>`);
  process.exit(1);
}
run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
