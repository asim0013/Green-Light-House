import { test, expect } from "@playwright/test";

/**
 * Placeholder e2e (Story 1.1) — verifies the app serves a page.
 * Real user-flow e2e (browse, RFQ, admin) arrive with their feature stories.
 * Requires `npx playwright install` for browser binaries.
 */
test("home page responds", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.ok()).toBeTruthy();
});
