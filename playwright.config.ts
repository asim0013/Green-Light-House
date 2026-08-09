import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — end-to-end tests in `/e2e`.
 * Run `npx playwright install` once to fetch browser binaries before `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  // The caching proof needs a PRODUCTION server (dev never engages the cache
  // handler), so it runs from `playwright.caching.config.ts` via
  // `npm run test:e2e:caching`. Running it here would assert nothing.
  testIgnore: /caching\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Capped deliberately. The whole suite drives ONE `next dev` process, so extra
  // workers add contention rather than throughput: they stampede the same
  // on-demand compile, and at 8 browsers the Chromium processes started dying
  // mid-run with "Protocol error (Runtime.evaluate): session closed" — a resource
  // failure masquerading as assertion failures. 4 is stable and barely slower.
  workers: 4,
  reporter: "list",
  // The suite runs against `next dev`, which compiles routes on demand; with
  // parallel workers hitting cold routes the default 5s assertion timeout is too
  // tight and produces flaky navigation assertions.
  expect: { timeout: 15_000 },
  // Same root cause, one level up: on a COLD `.next` every worker piles onto the
  // first on-demand compile of `/[locale]`, and `page.goto` alone can burn more
  // than the default 30s per-test budget — the whole suite then fails on timing,
  // not on behaviour. Verified: cold run 9 failed / warm run 19 passed, with
  // identical code. 60s absorbs the compile without weakening any assertion.
  // (Each spec also calls `warmUp()` in beforeAll, bounded to ~49s so it can never
  // exceed this budget and error the hook instead of running the tests.)
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
