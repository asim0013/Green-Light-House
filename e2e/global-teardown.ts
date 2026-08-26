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
  try {
    const url = process.env.REDIS_URL?.trim();
    if (!url) return;
    const { createClient } = await import("redis");
    const redis = createClient({
      url,
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
    // Redis down or unset — counters are disposable; nothing to report.
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
}
