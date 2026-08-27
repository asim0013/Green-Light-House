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

/** `queue:failed` — the dead-letter listing. */
export async function listFailed(): Promise<void> {
  await withQueue(async (queue) => {
    const jobs = await queue.getFailed(0, 100);
    if (jobs.length === 0) {
      console.log("[queue:failed] no failed jobs.");
      return;
    }
    console.log(`[queue:failed] ${jobs.length} job(s) in the dead-letter set:\n`);
    for (const job of jobs) {
      const data = job.data as { leadId?: string };
      console.log(
        `  job=${job.id} lead=${data.leadId ?? "?"} attempts=${job.attemptsMade} reason=${
          job.failedReason ?? "?"
        }`,
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
 * Finds leads that were committed but never enqueued (the AC's "a state a later
 * replay can pick up"): `notifiedAt` null AND `deliveryFailureReason` null,
 * older than the age floor. A terminal send failure writes a reason, so those
 * are excluded — they belong to `queue:retry`, not here.
 *
 * SAFE AGAINST DOUBLE-SENDING by construction: the worker's per-email
 * short-circuit reads the stamps, so re-enqueueing a lead that was in fact
 * already emailed sends nothing.
 */
export async function replayUnnotified(): Promise<void> {
  const cutoff = new Date(Date.now() - REPLAY_MIN_AGE_MS);
  const leads = await findLeadsAwaitingNotification(cutoff);
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
    for (const lead of leads) {
      try {
        await queue.add(RFQ_JOB_NAME, { leadId: lead.id }, { ...RFQ_JOB_OPTIONS, jobId: lead.id });
        enqueued++;
      } catch (error) {
        console.error(`  ${lead.reference} could not be enqueued:`, error);
      }
    }
    // Never silently partial: the counts are the report.
    console.log(`[queue:replay] enqueued ${enqueued}/${leads.length}.`);
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
