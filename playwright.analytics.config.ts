import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Story 5.8 ANALYTICS-ENABLED proof ONLY (review F3).
 *
 * The main suite runs with analytics unprovisioned, so it can only prove the safe
 * default. This config builds the app WITH both analytics values set — they are
 * BUILD-TIME (the domain is inlined, `rewrites()` is baked) — and points
 * PLAUSIBLE_HOST at a local stub (`e2e/support/plausible-stub.mjs`). So the test
 * exercises the real chain: consent → injected script → same-origin path →
 * rewrite → "provider", and event POST → same-origin → rewrite → "provider".
 *
 * A PRODUCTION build behind `next start`, deliberately: the dev CSP adds
 * `'unsafe-eval'` and `ws:`; the claim under test is that the SHIPPED CSP needs no
 * change. Like the caching config, the build poisons `.next` for `next dev` —
 * `rm -rf .next` before the next dev/main-suite run.
 *
 * Ports 3102 (app) / 3202 (stub): the main suite owns 3000, caching owns 3101.
 */
const STUB_PORT = 3202;
const APP_PORT = 3102;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /analytics-enabled\.spec\.ts/,
  fullyParallel: false,
  // One worker: the stub's event log is shared state, reset before each test.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${APP_PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "node e2e/support/plausible-stub.mjs",
      url: `http://localhost:${STUB_PORT}/health`,
      env: { STUB_PORT: String(STUB_PORT) },
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: `npm run build && npx next start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}/en`,
      env: {
        NEXT_PUBLIC_ANALYTICS_DOMAIN: "glh.test",
        PLAUSIBLE_HOST: `http://localhost:${STUB_PORT}`,
      },
      // Never reuse: a server built WITHOUT these values would silently pass nothing.
      reuseExistingServer: false,
      timeout: 300_000,
    },
  ],
});
