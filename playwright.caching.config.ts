import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Story 1.8 caching proof ONLY.
 *
 * It needs its own config because it must exercise the server AS DEPLOYED — a
 * production build behind `next start`, where route handling, bundling and the
 * cache handler all behave the way they will in the container.
 *
 * (An earlier version of this comment justified it with "`next dev` does not engage
 * the incremental cache handler at all". That is false — the Story 1.8 review
 * showed dev both reads and writes through the handler — and it is not why this
 * config exists. The real reasons are the production build, the serial mutation of
 * shared seeded rows, and a port of its own.)
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
  // `html` as well as `list`: CI uploads `playwright-report/` on failure, and with
  // `list` alone that directory is never generated, so the artifact was always
  // empty. `open: "never"` keeps it non-interactive on CI.
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3101",
    // Not `on-first-retry`: `retries` is 0 here, so that setting could never fire.
    trace: "retain-on-failure",
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
