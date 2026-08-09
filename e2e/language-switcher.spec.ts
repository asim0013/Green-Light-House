import { test, expect } from "@playwright/test";
import { probeDbReady } from "./dbReady";

/**
 * Story 1.4 — persistent language switcher (end-to-end).
 *
 * Proves: the switcher changes locale while preserving the current route, marks
 * the active locale (`aria-current`), and the choice persists across a reload and
 * a subsequent `/` visit (the `NEXT_LOCALE` cookie). Each Playwright test gets an
 * isolated browser context, so the cookie set here does not leak into other specs.
 *
 * Reads the seeded homepage for language assertions; skips if Postgres is down.
 * Story 1.7 re-pointed the h1 expectations at the real homepage copy — the proof
 * page it previously asserted against no longer exists.
 */

/** Distinctive opening of the localized `Home.title` h1 in each locale. */
const H1 = {
  en: "Industrial and fire-safety equipment",
  tr: "Endüstriyel ve yangın güvenliği",
} as const;

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady(baseURL);
});

test("switches locale, preserves route, marks active, and persists via cookie", async ({
  page,
}) => {
  test.skip(!dbReady, "seeded Postgres not reachable");

  // Pin the viewport above the xl gate (Playwright's default is exactly 1280, the
  // breakpoint itself) so the header's desktop switcher is the one under test.
  await page.setViewportSize({ width: 1440, height: 900 });

  // The switcher now appears in both the header and the footer (Story 1.6); scope
  // to the header so the accessible-name locators resolve to a single element.
  const header = page.getByRole("banner");

  // Start in English; the active locale is marked.
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.en);
  await expect(header.getByRole("link", { name: "English" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Switch to Turkish via the switcher → same route (home), new locale.
  await header.getByRole("link", { name: "Türkçe" }).click();
  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.tr);
  await expect(header.getByRole("link", { name: "Türkçe" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Previously-active locale is no longer marked.
  await expect(header.getByRole("link", { name: "English" })).not.toHaveAttribute(
    "aria-current",
    "page",
  );

  // Persists across a reload (cookie, not just the URL).
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.tr);

  // Visiting the unprefixed `/` redirects to the remembered locale.
  await page.goto("/");
  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.tr);
});
