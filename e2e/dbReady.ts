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
 * Wait for the dev server to finish its on-demand compile of `/[locale]`.
 *
 * Separate from the readiness question on purpose: this only absorbs first-hit
 * compile latency, and it NEVER reports failure — the tests themselves decide
 * whether the page is correct. Bounded well inside the per-test budget so it can
 * never blow the `beforeAll` hook (the old probe could burn ~249s against a 60s
 * hook budget and error the whole spec file).
 */
export async function warmUp(baseURL: string | undefined, attempts = 3): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctx = await pwRequest.newContext({ baseURL });
      const res = await ctx.get("/en", { timeout: 15_000 });
      await ctx.dispose();
      if (res.status() < 500) return; // compiled and serving (2xx/3xx/4xx all count)
    } catch {
      // server not accepting connections yet — retry
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
}
