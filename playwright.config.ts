import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — end-to-end tests in `/e2e`.
 * Run `npx playwright install` once to fetch browser binaries before `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  // The leads pollution gate (Story 3.2): sweeps `zzz-e2e-lead-` leftovers and
  // reports the census AFTER all workers finish — the one place a whole-prefix
  // sweep cannot race an in-flight worker.
  globalTeardown: "./e2e/global-teardown.ts",
  // The caching proof must run against the server AS DEPLOYED (production build,
  // `next start`) and mutates shared seeded rows, so it runs serially from
  // `playwright.caching.config.ts` via `npm run test:e2e:caching`.
  // NOT because "dev never engages the cache handler" — that was wrong; dev both
  // reads and writes through it (Story 1.8 review).
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
  // `html` alongside `list` so CI's `playwright-report/` failure artifact is
  // actually produced; with `list` alone the upload step had nothing to collect.
  reporter: [["list"], ["html", { open: "never" }]],
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
