import { test, expect } from "@playwright/test";
import { probeDbReady } from "./dbReady";

/**
 * Story 1.7 — projects-first homepage (end-to-end).
 *
 * Proves the surface a unit test cannot: that the real seeded project reaches the
 * hero through the repository, that both conversion paths are reachable, that the
 * discovery sections render, and that the layout survives a phone viewport.
 *
 * Viewports are pinned OFF the 1280 `xl` breakpoint (the Story-1.6 lesson —
 * Playwright's default viewport sits exactly on it, which made specs fragile).
 */

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady(baseURL);
});

test("hero leads with a delivered project, not a product grid", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  // The h1 is stable localized copy, not DB content (decision Q2).
  await expect(main.getByRole("heading", { level: 1 })).toContainText(
    "Industrial and fire-safety equipment",
  );
  // The proof itself comes from the seeded LNG project — outcome, industry, date.
  await expect(
    main.getByText("142 field devices, ATEX Zone 1, delivered in six weeks."),
  ).toBeVisible();
  await expect(main.getByRole("heading", { level: 2 }).first()).toContainText(
    "LNG terminal fire & gas upgrade",
  );
  await expect(main.getByText("June 2024")).toBeVisible();
});

test("both co-equal CTAs are reachable in the page body", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  // Hero + closing band: the RFQ CTA and the phone appear at both conversion beats.
  await expect(main.getByRole("link", { name: "Request Project Quote" })).toHaveCount(2);
  await expect(main.locator('a[href^="tel:"]')).toHaveCount(2);
});

test("discovery sections render industries, categories and manufacturers", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  await expect(main.getByText("Built for your sector")).toBeVisible();
  await expect(main.getByText("What we supply")).toBeVisible();
  await expect(main.getByText("Manufacturers we supply")).toBeVisible();

  // Seeded rows actually reached the page.
  await expect(main.getByText("Oil & Gas").first()).toBeVisible();
  await expect(main.getByText("Sentra Fire Systems")).toBeVisible();
  // A CHILD category must not appear as a top-level signpost.
  await expect(main.getByText("Flame detectors")).toHaveCount(0);
});

test("discovery items are display-only — no links to unbuilt routes (Q1/FR8)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  // The nav already links these routes; the homepage body must not multiply them
  // while they 404 (FR8's AC + the escalated bare-404 defer to Story 1.9).
  const main = page.getByRole("main");
  for (const route of ["/industries", "/products", "/projects", "/manufacturers"]) {
    await expect(main.locator(`a[href*="${route}"]`)).toHaveCount(0);
  }
  // The only navigational elements in the body are the RFQ CTA and the phone.
  const hrefs = await main
    .locator("a")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  expect(hrefs.every((h) => h.includes("/rfq") || h.startsWith("tel:"))).toBe(true);
});

test("credibility band sits beneath the hero and names no client", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  const capability = main.getByText("nuclear-grade QA discipline", { exact: false });
  await expect(capability).toBeVisible();
  await expect(main.getByText("ISO 9001")).toBeVisible();

  // FR10: validation layer BENEATH the outcome-led hero, never the headline.
  const h1Box = await main.getByRole("heading", { level: 1 }).boundingBox();
  const capBox = await capability.boundingBox();
  expect(capBox!.y).toBeGreaterThan(h1Box!.y);
});

test("shows no price or e-commerce affordance (FR2)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of ["add to cart", "add to basket", "buy now", "checkout"]) {
    expect(body).not.toContain(forbidden);
  }
  // No currency figures anywhere in the rendered page.
  expect(await page.locator("body").innerText()).not.toMatch(/[$€₺₽]\s?\d/);
});

test("hero stacks on a phone with no horizontal overflow", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(PHONE);
  await page.goto("/en");

  const main = page.getByRole("main");
  const h1Box = await main.getByRole("heading", { level: 1 }).boundingBox();
  const cardBox = await main.getByRole("heading", { level: 2 }).first().boundingBox();

  // Stacked: the proof card sits BELOW the positioning block, not beside it.
  expect(cardBox!.y).toBeGreaterThan(h1Box!.y);
  // And it uses the full column rather than being pinned to its desktop 420px.
  expect(cardBox!.width).toBeGreaterThan(280);

  // The page itself must never scroll sideways (EXPERIENCE § Responsive).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("both CTAs stay reachable on a phone (FR9: desktop AND mobile)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(PHONE);
  await page.goto("/en");

  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Request Project Quote" }).first()).toBeVisible();
  await expect(main.locator('a[href^="tel:"]').first()).toBeVisible();
});
