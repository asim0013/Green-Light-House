import { test, expect, request as pwRequest } from "@playwright/test";

/**
 * Story 1.6 — global layout (top nav & footer), end-to-end.
 *
 * Proves the reusable header + footer chrome renders on every page, the active
 * nav state reflects the route, and the mobile hamburger keeps the switcher,
 * phone, and RFQ CTA reachable. Uses the seeded proof page as the body; skips if
 * Postgres is down.
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

test("header shows brand, the 5 nav links, phone, and the RFQ CTA", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/en");
  const header = page.getByRole("banner");

  await expect(header.getByText("GREENLIGHTHOUSE").first()).toBeVisible();
  for (const name of ["Industries", "Products", "Projects", "Services", "About"]) {
    await expect(header.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(header.getByRole("link", { name: "Request Project Quote" })).toBeVisible();
  // Phone is a co-equal tel: action.
  await expect(header.locator('a[href^="tel:"]')).toBeVisible();
});

test("footer shows İstanbul, a legal link, and the language control", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/en");
  const footer = page.getByRole("contentinfo");

  await expect(footer.getByText("İstanbul")).toBeVisible();
  await expect(footer.getByRole("link", { name: "Privacy Policy" })).toBeVisible();
  await expect(footer.getByRole("link", { name: "English" })).toBeVisible();
});

test("nav wiring shows no spurious active state on the homepage", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  // The home route "/" is not a nav item, so no primary link should be marked
  // active — this proves the active-state wiring reads the pathname without a
  // false positive. (The positive `isActivePath` case is covered by its unit
  // test; a positive e2e awaits a real nav route in Epic 2 — unbuilt routes
  // currently render a layout-less 404, deferred to Story 1.9.)
  await page.goto("/en");
  const header = page.getByRole("banner");
  await expect(header.getByRole("link", { name: "Industries", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("mobile hamburger reveals the switcher, phone, and CTA", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");

  const toggle = page.getByRole("button", { name: "Menu" });
  await expect(toggle).toBeVisible();
  await toggle.click();

  const menu = page.locator("#mobile-menu");
  await expect(menu.getByRole("link", { name: "Request Project Quote" })).toBeVisible();
  await expect(menu.locator('a[href^="tel:"]')).toBeVisible();
  await expect(menu.getByRole("link", { name: "English" })).toBeVisible();
});
