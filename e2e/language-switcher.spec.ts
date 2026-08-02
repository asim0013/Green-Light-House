import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * Story 1.4 — persistent language switcher (end-to-end).
 *
 * Proves: the switcher changes locale while preserving the current route, marks
 * the active locale (`aria-current`), and the choice persists across a reload and
 * a subsequent `/` visit (the `NEXT_LOCALE` cookie). Each Playwright test gets an
 * isolated browser context, so the cookie set here does not leak into other specs.
 *
 * Reads the seeded proof page for language assertions; skips if Postgres is down.
 */

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  try {
    const ctx = await pwRequest.newContext({ baseURL });
    const res = await ctx.get("/en");
    dbReady = res.ok();
    await ctx.dispose();
  } catch {
    dbReady = false;
  }
});

test("switches locale, preserves route, marks active, and persists via cookie", async ({
  page,
}) => {
  test.skip(!dbReady, "seeded Postgres not reachable");

  // Start in English; the active locale is marked.
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Industries");
  await expect(page.getByRole("link", { name: "English" })).toHaveAttribute("aria-current", "page");

  // Switch to Turkish via the switcher → same route (home), new locale.
  await page.getByRole("link", { name: "Türkçe" }).click();
  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sektörler");
  await expect(page.getByRole("link", { name: "Türkçe" })).toHaveAttribute("aria-current", "page");
  // Previously-active locale is no longer marked.
  await expect(page.getByRole("link", { name: "English" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Persists across a reload (cookie, not just the URL).
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sektörler");

  // Visiting the unprefixed `/` redirects to the remembered locale.
  await page.goto("/");
  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sektörler");
});
