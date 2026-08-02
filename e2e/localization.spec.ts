import { test, expect } from "@playwright/test";

/**
 * Story 1.3 — localization framework & fallback contract (end-to-end).
 *
 * Proves: locale routing (`/en /tr /ru` + `/` redirect), correct `<html lang>`,
 * Turkish (latin-ext) + Russian (Cyrillic) rendering, and the content EN-fallback
 * indicator against the seeded catalog.
 *
 * Requires the running stack (dev server + seeded Postgres). The seed gives:
 *   - `oil-gas`      → EN + TR + RU  (real translation in every locale)
 *   - `fire-safety`  → EN + TR       (RU falls back to EN)
 *   - others         → EN only       (TR and RU fall back to EN)
 */

test("`/` redirects to a locale", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/(en|tr|ru)\/?$/);
});

test("/en renders English, correct lang, no fallback markers", async ({ page }) => {
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Industries");
  await expect(page.getByText("Oil & Gas")).toBeVisible();
  // Every field has an EN value → nothing is "shown in English" as a fallback.
  await expect(page.getByText("(shown in English)")).toHaveCount(0);
});

test("/tr renders Turkish, marks EN fallback where TR is missing", async ({ page }) => {
  await page.goto("/tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sektörler");
  // Real Turkish content (exercises latin-ext glyphs).
  await expect(page.getByText("Petrol ve Gaz")).toBeVisible();
  // At least one industry lacks TR → the EN fallback marker appears.
  await expect(page.getByText("(İngilizce gösteriliyor)").first()).toBeVisible();
});

test("/ru renders Cyrillic, marks EN fallback where RU is missing", async ({ page }) => {
  await page.goto("/ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  // Cyrillic heading (exercises the cyrillic subset).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Отрасли");
  // Real Russian content, shown without a fallback marker.
  await expect(page.getByText("Нефть и газ")).toBeVisible();
  // Industries without RU fall back to EN and are marked.
  await expect(page.getByText("(показано на английском)").first()).toBeVisible();
});
