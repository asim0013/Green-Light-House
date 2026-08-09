import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright — end-to-end tests in `/e2e`.
 * Run `npx playwright install` once to fetch browser binaries before `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  // The suite runs against `next dev`, which compiles routes on demand; with
  // parallel workers hitting cold routes the default 5s assertion timeout is too
  // tight and produces flaky navigation assertions.
  expect: { timeout: 15_000 },
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
