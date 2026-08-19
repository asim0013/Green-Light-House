import { request as pwRequest } from "@playwright/test";

/**
 * Decide whether the e2e content assertions can run (Story 1.6; hardened in the
 * Story 1.7 review).
 *
 * THE BUG THIS FIXES: the original probe skipped whenever `GET /en` was not 2xx.
 * That inverted the safety net — a homepage that threw at render also returns a
 * non-2xx, so the more broken the page, the more tests "passed" by skipping.
 * Reproduced: injecting a render-time throw into `HomeHero` produced
 * `18 skipped / 1 passed`, exit code 0.
 *
 * So the skip predicate must depend on the ENVIRONMENT, not on the page under
 * test. We probe Postgres directly:
 *   - DB unreachable  → skip (the suite genuinely cannot run here)
 *   - DB reachable    → RUN, whatever the page does. A 500 is then a red test,
 *                       which is the entire point of having the test.
 */

let cached: boolean | undefined;

/** Load `.env` so DATABASE_URL is available (Playwright does not do this for us). */
function loadEnv(): void {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // No .env — DATABASE_URL may still come from the ambient environment.
  }
}

/**
 * True when the seeded Postgres is reachable. Independent of the app, so a broken
 * page can never buy itself a skip.
 */
export async function probeDbReady(): Promise<boolean> {
  if (cached !== undefined) return cached;
  loadEnv();

  try {
    // Imported lazily so a missing/ungenerated client cannot break collection.
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      await prisma.$queryRaw`SELECT 1`;
      cached = true;
    } finally {
      await prisma.$disconnect();
    }
  } catch {
    cached = false;
  }

  return cached;
}

/**
 * Wait for the dev server to finish its on-demand compile of the routes a spec
 * needs.
 *
 * Separate from the readiness question on purpose: this only absorbs first-hit
 * compile latency, and it NEVER reports failure — the tests themselves decide
 * whether the page is correct. Bounded well inside the per-test budget so it can
 * never blow the `beforeAll` hook (the old probe could burn ~249s against a 60s
 * hook budget and error the whole spec file).
 *
 * WHY `paths` EXISTS (Story 2.1). It used to warm `/en` only, which was enough
 * while `/[locale]` was the single route. With `/industries` and
 * `/industries/[slug]` added, the FIRST hit on each still paid the compile inside a
 * test: measured on a cold `.next`, `/en/industries/oil-gas` took 19.7s to serve
 * while four workers piled onto it, against a 15s assertion timeout — three tests
 * failed on latency with no defect present, and passed on a warm re-run with
 * identical code. Each spec now warms what it actually navigates to.
 *
 * Requests go out CONCURRENTLY, so adding paths costs little extra wall clock — but
 * NOT zero: the slowest path sets the pace, and cold compiles are not free.
 *
 * THE PER-REQUEST TIMEOUT MUST EXCEED THE COMPILE IT ABSORBS. It was briefly 12s,
 * which was below the 19.7s this docstring itself records — so on the cold run it
 * was meant to fix, every attempt would abort mid-compile and the warm-up degraded
 * to "hit the route three times and give up". 25s clears the measured figure with
 * headroom; attempts drop to 2 to stay inside the 60s beforeAll budget
 * (2 × (25s + 2s) = 54s).
 */
export async function warmUp(
  baseURL: string | undefined,
  paths: readonly string[] = ["/en"],
  attempts = 2,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctx = await pwRequest.newContext({ baseURL });
      const statuses = await Promise.all(
        paths.map((path) =>
          ctx
            .get(path, { timeout: 25_000 })
            .then((res) => res.status())
            // 599 is a local sentinel for "did not answer in time", not a real
            // status — it just has to be >= 500 so this attempt does not count as
            // warm.
            .catch(() => 599),
        ),
      );
      await ctx.dispose();
      // 2xx/3xx/4xx all count as compiled and serving.
      if (statuses.every((status) => status < 500)) return;
    } catch {
      // server not accepting connections yet — retry
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}
