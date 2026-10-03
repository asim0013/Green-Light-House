import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Responsive behaviour (Story 5.5 — UX-DR27). The headline is the sticky mobile
 * CTA bar on the two-column conversion pages; the rest guards that no page forces
 * horizontal scroll at phone width.
 *
 * ⚠️ Named `responsive.spec.ts` — nothing with "caching" in it (the unanchored
 * caching-suite regex, per the contact.spec lesson).
 *
 * Seeded slugs: product `fd-9500`, project `hospital-fire-suppression`.
 */

const MOBILE = { width: 375, height: 812 };
const DESKTOP = { width: 1440, height: 900 };
const NO_SCROLL_PAGES = ["/en", "/en/products", "/en/products/fd-9500", "/en/projects/hospital-fire-suppression"];

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) expect(dbReady).toBe(true);
  await warmUp(baseURL, ["/en/products/fd-9500", "/en/projects/hospital-fire-suppression", "/en/products"]);
});

test.describe("sticky mobile CTA bar (AC1)", () => {
  for (const { path, doorwayHref } of [
    { path: "/en/products/fd-9500", doorwayHref: "/rfq?product=fd-9500" },
    { path: "/en/projects/hospital-fire-suppression", doorwayHref: "/rfq?project=hospital-fire-suppression" },
  ]) {
    test(`${path}: the bar is visible at mobile, with a quote + call action`, async ({ page }, testInfo) => {
      if (!dbReady) testInfo.skip();
      await page.setViewportSize(MOBILE);
      await page.goto(path);
      const bar = page.getByRole("navigation", { name: "Quick actions" });
      await expect(bar).toBeVisible();
      // Quote → the page's doorway href; Call → tel:. `$=` because next-intl's
      // <Link> prefixes the locale (`/en/rfq?...`).
      await expect(bar.locator(`a[href$="${doorwayHref}"]`)).toBeVisible();
      await expect(bar.locator('a[href^="tel:"]')).toBeVisible();
    });

    test(`${path}: the bar is ABSENT at desktop (the anchor card carries the CTAs)`, async ({ page }, testInfo) => {
      if (!dbReady) testInfo.skip();
      await page.setViewportSize(DESKTOP);
      await page.goto(path);
      // lg:hidden → display:none at desktop widths.
      await expect(page.getByRole("navigation", { name: "Quick actions" })).toBeHidden();
    });
  }
});

test.describe("no horizontal page scroll at phone width (AC3)", () => {
  for (const path of NO_SCROLL_PAGES) {
    test(`${path} does not scroll sideways at 375px`, async ({ page }, testInfo) => {
      if (!dbReady) testInfo.skip();
      await page.setViewportSize(MOBILE);
      await page.goto(path);
      // A wide table/element would push documentElement.scrollWidth past the viewport.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe("card grids reflow to one column at phone width (AC2)", () => {
  test("the product listing grid is a single column at 375px", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.setViewportSize(MOBILE);
    await page.goto("/en/products");
    // The first grid of product cards: at 375 it must render ONE column track.
    const columns = await page.evaluate(() => {
      const grid = document.querySelector("main ul.grid, main div.grid, main [class*='grid-cols']");
      if (!grid) return null;
      return getComputedStyle(grid as Element).gridTemplateColumns.split(" ").length;
    });
    // null → no grid found (don't fail spuriously); otherwise it must be 1 track.
    expect(columns === null || columns === 1, `grid had ${columns} columns at 375px`).toBe(true);
  });
});
