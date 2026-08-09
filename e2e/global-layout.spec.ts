import { test, expect } from "@playwright/test";
import { probeDbReady } from "./dbReady";

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
  dbReady = await probeDbReady(baseURL);
});

test("header shows brand, the 5 nav links, phone, and the RFQ CTA", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  // The inline nav only renders from 1280px up (RU labels overflow below it).
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/en");
  const header = page.getByRole("banner");

  // Strict-mode locators: exactly one match each, so a duplicate would fail.
  await expect(header.getByRole("link", { name: "GREENLIGHTHOUSE" })).toBeVisible();
  for (const name of ["Industries", "Products", "Projects", "Services", "About"]) {
    await expect(header.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(header.getByRole("link", { name: "Request Project Quote" })).toBeVisible();
  // Phone is a co-equal tel: action. The header renders two tel: anchors (desktop
  // cluster + mobile menu); at this width only the desktop one is visible, so
  // assert on the visible-role query rather than a CSS locator that sees both.
  await expect(header.getByRole("link", { name: /Call us/ })).toBeVisible();
});

test("header fits its container without horizontal overflow (all locales)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  // Russian carries the longest labels — the regression this guards is the CTA
  // spilling past the viewport at the breakpoint where the inline nav turns on.
  for (const width of [375, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/ru");
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflows, `horizontal overflow at ${width}px`).toBe(false);
  }
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
  // Pin the viewport above the xl gate — Playwright's default is exactly 1280,
  // i.e. sitting on the breakpoint, which makes the test fragile to a gate tweak.
  await page.setViewportSize({ width: 1440, height: 900 });
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

test("mobile hamburger reveals the switcher, phone, and CTA — and closes again", async ({
  page,
}) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");

  const header = page.getByRole("banner");
  const menu = page.locator("#mobile-menu");
  const toggle = page.getByRole("button", { name: "Menu" });

  // The inline desktop nav must be hidden at this width...
  await expect(header.getByRole("navigation", { name: "Primary" })).toBeHidden();
  // ...and the menu starts collapsed.
  await expect(menu).toBeHidden();
  await expect(toggle).toBeVisible();

  await toggle.click();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Request Project Quote" })).toBeVisible();
  await expect(menu.locator('a[href^="tel:"]')).toBeVisible();
  await expect(menu.getByRole("link", { name: "English" })).toBeVisible();

  // Move focus INTO the panel first — otherwise focus is still sitting on the
  // toggle from the click and "focus restored" would pass with the restore code
  // deleted.
  await page.keyboard.press("Tab");
  await expect(menu.locator(":focus")).toHaveCount(1);

  // Escape closes it and pulls focus back out of the (now unmounted) panel.
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Menu" })).toBeFocused();
});

test("switching locale from the mobile menu closes it", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en");

  await page.getByRole("button", { name: "Menu" }).click();
  const menu = page.locator("#mobile-menu");
  await expect(menu).toBeVisible();

  // The in-menu switcher navigates — the panel must not stay open over the new page.
  await menu.getByRole("link", { name: "Türkçe" }).click();
  await expect(page).toHaveURL(/\/tr\/?$/);
  await expect(menu).toBeHidden();
});
