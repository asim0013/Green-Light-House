/**
 * The post-suite DB-pollution gate for leads (Story 3.2 review — the story
 * record had called a hand-run query a "gate"; this makes it one). Runs once,
 * after every worker is done, so the whole-prefix sweep cannot race an
 * in-flight test the way a per-worker `afterAll` sweep did (proven live in
 * 3.2's first full-suite run).
 *
 * Two clauses, both load-bearing:
 *  1. sweep + report every `zzz-e2e-lead-` row (a non-zero count BEFORE the
 *     sweep means some worker's cleanup failed — reported, then cleaned);
 *  2. report the total `leads` count, which catches a test that submitted a
 *     NON-prefixed email — the prefix census alone cannot see those.
 * The teardown never fails the suite (Playwright teardown errors mask test
 * results); it reports, and the numbers land in the story record's gate line.
 */
export default async function globalTeardown() {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // ambient env
  }
  try {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient();
    try {
      const leftover = await db.lead.count({
        where: { email: { startsWith: "zzz-e2e-lead-" } },
      });
      if (leftover > 0) {
        console.warn(
          `[pollution-gate] ${leftover} zzz-e2e-lead- row(s) survived a worker cleanup — sweeping`,
        );
        await db.lead.deleteMany({ where: { email: { startsWith: "zzz-e2e-lead-" } } });
      }
      const total = await db.lead.count();
      console.log(`[pollution-gate] leads total=${total} zzz-e2e-leftover-swept=${leftover}`);
    } finally {
      await db.$disconnect();
    }
  } catch {
    // No DB (the suite skipped) — nothing to sweep.
  }

  // Rate-limit counters (Story 3.7a): pure hygiene, not correctness — every
  // test buckets on its own spoofed IP, and unswept counters expire in 1h
  // anyway. Reported so the census line shows what a run minted. The bounded
  // client is the cache-flush.mjs recipe: node-redis's default reconnect makes
  // connect() never settle against a dead target.
  //
  // ⚠️ `if (!url) return` HERE ABORTED THE WHOLE TEARDOWN. This is one census
  // among four, and an early `return` in the second one silently skipped the
  // storage and queue censuses below whenever `REDIS_URL` happened to be empty
  // — so the gate line would report on a run it had barely inspected. Each
  // census now SKIPS ITSELF and nothing else.
  const cacheUrl = process.env.REDIS_URL?.trim();
  if (cacheUrl) {
    try {
      const { createClient } = await import("redis");
      const redis = createClient({
        url: cacheUrl,
        socket: { connectTimeout: 3000, reconnectStrategy: false },
      });
      redis.on("error", () => {});
      await redis.connect();
      try {
        let swept = 0;
        for await (const keys of redis.scanIterator({ MATCH: "rfq:rl:*", COUNT: 500 })) {
          const batch = Array.isArray(keys) ? keys : [keys];
          if (batch.length > 0) swept += await redis.del(batch);
        }
        console.log(`[pollution-gate] rfq:rl counters swept=${swept}`);
      } finally {
        redis.destroy();
      }
    } catch {
      // Redis down — counters are disposable; nothing to report.
    }
  }

  // STORAGE (Story 3.7b, AC16). The leads census above cannot see this class of
  // pollution at all: an attachment e2e that uploads and then fails before its
  // cleanup leaves a REAL object in the bucket, with no row pointing at it — and
  // the very design that makes quarantine safe (no serving route, key only in
  // the DB) is what makes an orphan invisible. Counting `quarantine/` is the
  // only way anyone finds out.
  //
  // Reported, never swept: unlike a rate-limit counter, a quarantined object may
  // be a genuine submission from a manual test, and a teardown that deletes real
  // uploads to keep a number tidy is worse than a number that is not tidy. The
  // count lands in the story record's gate line where a human can judge it.
  try {
    const { listStorageKeys } = await import("./storageReady");
    const quarantined = await listStorageKeys("quarantine/");
    console.log(`[pollution-gate] quarantine/ objects=${quarantined.length}`);
    if (quarantined.length > 0) {
      console.warn(
        `[pollution-gate] ${quarantined.length} object(s) under quarantine/ — expected 0 after a clean run; ` +
          `each is an attachment whose test did not clean up, or a real submission. NOT swept: ${quarantined
            .slice(0, 10)
            .join(", ")}`,
      );
    }
  } catch {
    // Storage unreachable — nothing to census.
  }

  // THE QUEUE (Story 3.3). Neither the leads census nor the storage one can see
  // this class of leftover: the queue instance is AOF-backed, so jobs and Job
  // Schedulers SURVIVE restarts. A crashed integration run leaves a scheduler
  // re-firing forever against a queue nobody is watching, and the only symptom
  // is a slowly growing Redis.
  //
  // Reported, never swept: the production `rfq.submitted` queue may legitimately
  // hold real inquiries mid-retry, and a teardown that deleted those to keep a
  // number tidy would destroy exactly what FR29 exists to protect. The counts
  // land in the story record's gate line where a human can judge them.
  // Same self-skipping shape as the counters census above, for the same reason:
  // a `return` here would abort anything a later story appends.
  const queueUrl = process.env.REDIS_QUEUE_URL?.trim();
  if (!queueUrl) {
    console.log("[pollution-gate] queue census skipped — REDIS_QUEUE_URL unset");
    return;
  }
  try {
    const url = queueUrl;
    const IORedis = (await import("ioredis")).default;
    const client = new IORedis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      lazyConnect: true,
      // Bounded: ioredis retries forever by default, which would hang teardown.
      retryStrategy: () => null,
    });
    client.on("error", () => {});
    try {
      await client.connect();
      const keys = await client.keys("bull:*");
      const queues = new Set(keys.map((key) => key.split(":")[1]).filter(Boolean));
      console.log(
        `[pollution-gate] queue instance: ${keys.length} bull key(s) across ${queues.size} queue(s)` +
          (queues.size > 0 ? ` [${[...queues].join(", ")}]` : ""),
      );
      const testQueues = [...queues].filter((name) => name.startsWith("test."));
      if (testQueues.length > 0) {
        console.warn(
          `[pollution-gate] ${testQueues.length} TEST queue(s) survived a run — expected 0 after a clean` +
            ` integration suite: ${testQueues.join(", ")}. NOT swept.`,
        );
      }
    } finally {
      client.disconnect();
    }
  } catch {
    // Queue unreachable — nothing to census.
  }
}
