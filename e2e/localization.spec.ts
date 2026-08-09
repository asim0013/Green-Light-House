import { test, expect } from "@playwright/test";
import { probeDbReady } from "./dbReady";

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
 *   - `energy` etc.  → EN only       (TR and RU fall back to EN)
 *
 * The content assertions read the seeded DB; if Postgres is unreachable the proof
 * page 500s, so we probe once and skip those tests rather than hard-failing.
 */

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady(baseURL);
});

test("`/` redirects to the default locale (`/en`)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/?$/);
});

test("/en renders English, correct lang, no fallback markers", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Industries");
  await expect(page.getByText("Oil & Gas")).toBeVisible();
  // Every field has an EN value → nothing is "shown in English" as a fallback.
  await expect(page.getByText("(shown in English)")).toHaveCount(0);
});

test("/tr renders Turkish, marks EN fallback where TR is missing", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sektörler");
  // Real Turkish content (exercises latin-ext glyphs), shown without a marker.
  const oilGasRow = page.locator("li", { hasText: "Petrol ve Gaz" });
  await expect(oilGasRow.getByText("(İngilizce gösteriliyor)")).toHaveCount(0);
  // An EN-only industry falls back to EN and IS marked.
  const energyRow = page.locator("li", { hasText: "Energy" });
  await expect(energyRow.getByText("(İngilizce gösteriliyor)")).toBeVisible();
});

test("/ru renders Cyrillic, marks EN fallback where RU is missing", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  // Cyrillic heading (exercises the cyrillic subset).
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Отрасли");
  // Contrast: genuinely-translated content shows no marker...
  const oilGasRow = page.locator("li", { hasText: "Нефть и газ" });
  await expect(oilGasRow.getByText("(показано на английском)")).toHaveCount(0);
  // ...while an EN-only industry falls back to EN and IS marked.
  const energyRow = page.locator("li", { hasText: "Energy" });
  await expect(energyRow.getByText("(показано на английском)")).toBeVisible();
});
