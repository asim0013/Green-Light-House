import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

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
 * The content assertions read the seeded DB; if Postgres is unreachable the page
 * 500s, so we probe once and skip those tests rather than hard-failing.
 *
 * Story 1.7 re-pointed these at the real homepage (the temporary proof page is
 * gone). The h1 is now localized UI copy rather than a DB value, and the industry
 * rows moved into the homepage's industry section — but they are still `<li>`
 * elements carrying the same fallback marker, so the FR34a proof is unchanged in
 * substance. Assertions were re-aimed, NOT relaxed.
 */

/** Distinctive opening of the localized `Home.title` h1 in each locale. */
const H1 = {
  en: "Industrial and fire-safety equipment",
  tr: "Endüstriyel ve yangın güvenliği",
  ru: "Промышленное и противопожарное",
} as const;

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL);
});

test("`/` redirects to the default locale (`/en`)", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/en\/?$/);
});

test("/en renders English, correct lang, no fallback markers", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/en");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.en);
  await expect(page.getByText("Oil & Gas").first()).toBeVisible();
  // Every field has an EN value → nothing is "shown in English" as a fallback.
  await expect(page.getByText("(shown in English)")).toHaveCount(0);
});

test("/tr renders Turkish, marks EN fallback where TR is missing", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/tr");
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.tr);
  // Real Turkish content (exercises latin-ext glyphs), shown without a marker.
  const oilGasRow = page.locator("li", { hasText: "Petrol ve Gaz" });
  await expect(oilGasRow.getByText("(İngilizce gösteriliyor)")).toHaveCount(0);
  // An EN-only industry falls back to EN and IS marked.
  const energyRow = page.locator("li", { hasText: "Energy" });
  await expect(energyRow.getByText("(İngilizce gösteriliyor)")).toBeVisible();
  // The seeded LNG project HAS a Turkish title, so the hero is unmarked here —
  // the contrast case for the Russian test below. Assert the ABSENCE, otherwise
  // the comment is the only thing claiming it.
  const hero = page.getByRole("heading", { level: 2 }).first();
  await expect(hero).toContainText("LNG terminali");
  await expect(hero.getByText("(İngilizce gösteriliyor)")).toHaveCount(0);
});

test("/ru renders Cyrillic, marks EN fallback where RU is missing", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  // Cyrillic heading (exercises the cyrillic subset).
  await expect(page.getByRole("heading", { level: 1 })).toContainText(H1.ru);
  // Contrast: genuinely-translated content shows no marker...
  const oilGasRow = page.locator("li", { hasText: "Нефть и газ" });
  await expect(oilGasRow.getByText("(показано на английском)")).toHaveCount(0);
  // ...while an EN-only industry falls back to EN and IS marked.
  const energyRow = page.locator("li", { hasText: "Energy" });
  await expect(energyRow.getByText("(показано на английском)")).toBeVisible();
  // Fallback is not industry-specific: the hero PROJECT has no Russian title, so
  // the same contract marks it too (a second entity type, via a second repository).
  const heroCard = page.getByRole("heading", { level: 2 }).first();
  await expect(heroCard).toContainText("LNG terminal fire & gas upgrade");
  await expect(heroCard.getByText("(показано на английском)")).toBeVisible();
});
