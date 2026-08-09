import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Story 1.8 caching proof ONLY.
 *
 * It needs its own config because it needs a PRODUCTION server: verified
 * empirically that `next dev` does not engage the incremental cache handler at all
 * (0 Redis keys after a dev request, 4 after a production one), so running the
 * caching spec against the main dev-server config would assert nothing.
 *
 * Port 3101 rather than 3000 — the main suite uses 3000, and so does the separate
 * LogiSupp project in this workspace, whose dev server Playwright's
 * `reuseExistingServer` will silently adopt.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /caching\.spec\.ts/,
  fullyParallel: false,
  // One worker: the spec mutates shared seeded rows, so parallel runs would race.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3101",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run build && npx next start -p 3101",
    url: "http://localhost:3101/en",
    // Never reuse: a stale build would test yesterday's code, and this is the one
    // suite whose whole point is that the server behaves like production.
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
