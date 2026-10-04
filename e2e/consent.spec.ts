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
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
  const names = (await context.cookies()).map((c) => c.name);
  expect(essentialOnly(names), `only essential cookies on first visit, got ${names.join(",")}`).toBe(
    true,
  );
  // No glh-consent until a choice is made (privacy-first default = denied).
  expect(names).not.toContain("glh-consent");
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

test("Accept persists granted", async ({ page, context }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await page.goto("/en");
  await page.getByRole("region", { name: "Cookie consent" }).getByRole("button", { name: "Accept" }).click();
  expect((await context.cookies()).find((c) => c.name === "glh-consent")?.value).toBe("granted");
});

test("the footer 'Cookie settings' control re-opens the bar after a choice", async ({ page }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await page.goto("/en");
  await page.getByRole("region", { name: "Cookie consent" }).getByRole("button", { name: "Decline" }).click();
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeHidden();
  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible();
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
