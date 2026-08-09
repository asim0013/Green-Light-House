import { request as pwRequest } from "@playwright/test";

/**
 * Probe whether the app can serve a seeded page (Story 1.6 review).
 *
 * The pages under test read Postgres, so the suite skips cleanly when the DB is
 * down rather than reporting a wall of failures. The probe RETRIES because the
 * first request also triggers Next's on-demand dev compile — a single attempt
 * races the compile and wrongly reports the database as unreachable, silently
 * skipping real coverage.
 */
export async function probeDbReady(baseURL: string | undefined, attempts = 4): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    try {
      const ctx = await pwRequest.newContext({ baseURL });
      const res = await ctx.get("/en", { timeout: 60_000 });
      await ctx.dispose();
      if (res.ok()) return true;
    } catch {
      // fall through to retry
    }
    await new Promise((r) => setTimeout(r, 3_000));
  }
  return false;
}
