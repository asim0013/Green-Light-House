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

test("mobile: the open consent bar publishes its height so the CTA bar can clear it (375px)", async ({ page }, testInfo) => {
  if (!dbReady) testInfo.skip();
  // A detail page carries a MobileCtaBar (Story 5.5). With no consent choice yet,
  // the fixed consent bar (z-50) would otherwise occlude the sticky CTA bar (z-40),
  // blocking Request-quote / Call for a visitor who never chooses (review 5.2 #5).
  // The fix is a published CSS var the CTA bar lifts by. The BROWSER-only half —
  // the bar measuring itself and publishing its TRUE height — is proven here;
  // that the CTA bar CONSUMES the var (`bottom-[var(--glh-consent-h,0px)]`) is proven
  // by MobileCtaBar.test.tsx (a revert to `bottom-0` reddens there).
  // `getComputedStyle(sticky).bottom` is NOT used — it reflects scroll-dependent
  // sticky layout, not the CSS var, so it is unreliable.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/en/products/as-60");
  const bar = page.getByRole("region", { name: "Cookie consent" });
  await expect(bar).toBeVisible();
  const readVar = () =>
    page.evaluate(
      () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--glh-consent-h")) || 0,
    );
  await expect.poll(readVar, { message: "consent bar publishes a positive height" }).toBeGreaterThan(0);
  // The published height equals the bar's REAL rendered height (so the CTA lifts by
  // exactly the right amount). Atomic read so a still-settling height can't race.
  const { varH, boxH } = await page.evaluate(() => {
    const el = document.querySelector('[aria-label="Cookie consent"]') as HTMLElement | null;
    return {
      varH: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--glh-consent-h")) || 0,
      boxH: el ? el.getBoundingClientRect().height : -1,
    };
  });
  expect(Math.abs(varH - boxH), `published ${varH}px == bar height ${boxH}px`).toBeLessThanOrEqual(1);
  // Dismiss ⇒ the var collapses so the CTA bar returns flush to the bottom.
  await bar.getByRole("button", { name: "Decline" }).click();
  await expect(bar).toBeHidden();
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
