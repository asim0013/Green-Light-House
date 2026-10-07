import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Privacy-friendly analytics (Story 5.8 — FR31 measurement half, FR46).
 *
 * This suite runs in the DEFAULT environment, where analytics is UNPROVISIONED
 * (`NEXT_PUBLIC_ANALYTICS_DOMAIN` / `PLAUSIBLE_HOST` unset). It proves the
 * safe-default invariant END-TO-END: nothing analytics-related loads, requests or
 * fires — even after the visitor GRANTS consent — and the page is unaffected. An
 * unprovisioned deploy is therefore silent (AC6), and the env gate is the OUTER
 * guard sitting in front of the consent gate.
 *
 * ⚠️ THIS SUITE CANNOT TELL A WORKING CONSENT GATE FROM A BROKEN ONE — with
 * analytics off, both pass (review F3). The ENABLED path (consent gate, live
 * Accept/revoke, the same-origin pipe through the build-time rewrite, the PII-free
 * Phone event, the shipped CSP) is proven by `e2e/analytics-enabled.spec.ts`, which
 * runs from `playwright.analytics.config.ts` against a production build with both
 * values set and a local Plausible stub (`npm run test:e2e:analytics`). The RFQ fire
 * is unit-proven in `RfqConfirmation.test.tsx` (an e2e RFQ would write a lead).
 */
let dbReady = true;
const isAnalyticsPath = (url: string) => /\/hive\/|\/api\/hive\//.test(new URL(url).pathname);

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) expect(dbReady).toBe(true);
  await warmUp(baseURL, ["/en"]);
});

test("unprovisioned: no analytics request, script or cookie — even after consent (AC6)", async ({
  page,
  context,
}, testInfo) => {
  if (!dbReady) testInfo.skip();
  const analyticsRequests: string[] = [];
  page.on("request", (r) => {
    if (isAnalyticsPath(r.url())) analyticsRequests.push(r.url());
  });

  await page.goto("/en");
  await page.waitForLoadState("networkidle");
  // Nothing before a choice.
  expect(await page.locator("#glh-plausible").count()).toBe(0);

  // Grant consent — STILL nothing, because analytics is unprovisioned (env gate).
  await page
    .getByRole("region", { name: "Cookie consent" })
    .getByRole("button", { name: "Accept" })
    .click();
  await page.waitForLoadState("networkidle");
  expect(await page.locator("#glh-plausible").count()).toBe(0);
  expect(analyticsRequests, `no analytics requests; got ${analyticsRequests.join(",")}`).toEqual(
    [],
  );

  // Only essential cookies — never an analytics identifier.
  const extra = (await context.cookies())
    .map((c) => c.name)
    .filter((n) => n !== "NEXT_LOCALE" && n !== "glh-consent");
  expect(extra, `only essential cookies, extra: ${extra.join(",")}`).toEqual([]);
});

test("the disabled loader raises no CSP or console error (inert, not broken)", async ({
  page,
}, testInfo) => {
  if (!dbReady) testInfo.skip();
  const csp: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /content security policy/i.test(m.text())) csp.push(m.text());
  });
  await page.goto("/en");
  await page
    .getByRole("region", { name: "Cookie consent" })
    .getByRole("button", { name: "Accept" })
    .click();
  await page.waitForLoadState("networkidle");
  expect(csp, csp.join("\n")).toEqual([]);
});
