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
}
