import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Cookie consent (Story 5.2 — FR46). Proves: first visit sets NO non-essential
 * cookie and shows the privacy-first bar; Decline/Accept persist the choice and
 * dismiss it; the footer "Cookie settings" re-opens it; no CSP console violation.
 *
 * Each Playwright test gets a fresh context (no cookies), which is the "first visit".
 * Named without "caching".
 */

let dbReady = true;

const essentialOnly = (names: string[]) =>
  names.every((n) => n === "NEXT_LOCALE" || n === "glh-consent");

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) expect(dbReady).toBe(true);
  await warmUp(baseURL, ["/en"]);
});

test("first visit: banner shown, and NO non-essential cookie is set", async ({ page, context }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await page.goto("/en");
  const bar = page.getByRole("region", { name: "Cookie consent" });
  await expect(bar).toBeVisible();
  // ⚠️ Wait for hydration + network quiet BEFORE reading cookies (review 5.2 #1):
  // a non-essential cookie set in a client effect (e.g. a future analytics loader)
  // lands AFTER the server-rendered banner is visible; reading immediately misses it.
  await expect(bar.getByRole("button", { name: "Accept" })).toBeEnabled();
  await page.waitForLoadState("networkidle");
  const names = (await context.cookies()).map((c) => c.name);
  expect(essentialOnly(names), `only essential cookies on first visit, got ${names.join(",")}`).toBe(
    true,
  );
  // No glh-consent until a choice is made (privacy-first default = denied).
  expect(names).not.toContain("glh-consent");
  // And still nothing non-essential once the bar is dismissed.
  await bar.getByRole("button", { name: "Decline" }).click();
  await expect(bar).toBeHidden();
  await page.waitForLoadState("networkidle");
  const after = (await context.cookies()).map((c) => c.name);
  expect(essentialOnly(after), `only essential cookies after dismissal, got ${after.join(",")}`).toBe(
    true,
  );
});

test("Decline persists denied, dismisses the bar, sets no non-essential cookie", async ({ page, context }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await page.goto("/en");
  const bar = page.getByRole("region", { name: "Cookie consent" });
  await bar.getByRole("button", { name: "Decline" }).click();
  await expect(bar).toBeHidden();
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === "glh-consent")?.value).toBe("denied");
  expect(essentialOnly(cookies.map((c) => c.name))).toBe(true);
  // Reload ⇒ no banner (choice remembered, server-computed initialShow=false).
  await page.goto("/en");
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
});

test("Accept persists granted and the bar does not reappear on reload", async ({ page, context }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await page.goto("/en");
  await page.getByRole("region", { name: "Cookie consent" }).getByRole("button", { name: "Accept" }).click();
  expect((await context.cookies()).find((c) => c.name === "glh-consent")?.value).toBe("granted");
  // ⚠️ A granted visitor must NOT be nagged on every page (review 5.2 #3): the
  // server-computed initialShow must keep the bar hidden after the choice.
  await page.goto("/en");
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
});

test("the footer 'Cookie settings' control re-opens the bar after a choice", async ({ page }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await page.goto("/en");
  await page.getByRole("region", { name: "Cookie consent" }).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
});

test("mobile: the sticky CTA bar lifts above the consent bar (375px)", async ({ page }, testInfo) => {
  if (!dbReady) testInfo.skip();
  // A detail page carries a MobileCtaBar (Story 5.5). With no consent choice yet,
  // the fixed consent bar (z-50) would otherwise occlude the sticky CTA bar (z-40)
  // and block Request-quote / Call for a visitor who never chooses (review 5.2 #5).
  // We assert the MECHANISM (robust; geometry is scroll/sticky-dependent): the open
  // bar publishes a positive `--glh-consent-h`, and the CTA bar's computed `bottom`
  // equals it — i.e. it is lifted exactly clear of the bar. Old `bottom-0` ⇒ "0px" ⇒ red.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/products/as-60");
  const cta = page.getByRole("navigation", { name: "Quick actions" });
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
  await expect(cta).toBeAttached();
  const readVar = () =>
    page.evaluate(
      () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--glh-consent-h")) || 0,
    );
  // After hydration the banner's effect measures itself → positive height.
  await expect.poll(readVar, { message: "consent bar publishes its height" }).toBeGreaterThan(0);
  // Read the var AND the CTA's resolved `bottom` in ONE snapshot — the banner height
  // can still be settling (font reflow), and the CTA always tracks the CURRENT var,
  // so two separate reads race. Atomic read ⇒ they resolve the same value.
  const { h, bottom } = await page.evaluate(() => {
    const nav = document.querySelector('nav[aria-label="Quick actions"]');
    return {
      h: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--glh-consent-h")) || 0,
      bottom: nav ? parseFloat(getComputedStyle(nav).bottom) || 0 : -1,
    };
  });
  expect(bottom, `CTA bar lifted to bottom=${bottom}px, matching var ${h}px`).toBeGreaterThan(0);
  expect(Math.abs(bottom - h), "CTA sits flush above the bar").toBeLessThanOrEqual(1);
  // Dismiss ⇒ the var collapses and the CTA bar returns flush to the bottom.
  await page.getByRole("region", { name: "Cookie consent" }).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
  await expect.poll(readVar, { message: "var collapses to 0 after dismissal" }).toBe(0);
});

test("no CSP violation from the consent UI", async ({ page }, testInfo) => {
  if (!dbReady) testInfo.skip();
  const violations: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /content security policy/i.test(m.text())) violations.push(m.text());
  });
  await page.goto("/en");
  await page.getByRole("region", { name: "Cookie consent" }).getByRole("button", { name: "Accept" }).click();
  expect(violations, violations.join("\n")).toEqual([]);
});
