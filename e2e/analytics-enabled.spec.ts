import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Analytics, ENABLED (Story 5.8 review F3) — runs ONLY via
 * `playwright.analytics.config.ts`: a production build with
 * NEXT_PUBLIC_ANALYTICS_DOMAIN=glh.test and PLAUSIBLE_HOST pointed at the local
 * Plausible stub (`e2e/support/plausible-stub.mjs`, port 3202).
 *
 * `e2e/analytics.spec.ts` (main suite) proves only the unprovisioned default and
 * would pass whether or not the consent gate worked. THIS suite proves the gate and
 * the pipe with analytics ON, by reading what actually reached the "provider":
 *   - nothing reaches it before consent, or after Decline;
 *   - Accept-after-load starts it with no reload; a later revoke stops it;
 *   - the Phone event carries path+locale and never the number;
 *   - all of it under the SHIPPED (production) CSP, with zero violations — and a
 *     control test proves the violation detector actually fires.
 */
const STUB = "http://localhost:3202";
const ANALYTICS = /\/hive\/js\/script\.js|\/api\/hive\/event/;
const CONSENT = "Cookie consent";

type StubEvent = { n?: string; d?: string; u?: string; p?: Record<string, string>; raw?: string };

const events = async (request: APIRequestContext): Promise<StubEvent[]> =>
  (await request.get(`${STUB}/__events`)).json();

/** Collect CSP console violations + same-origin analytics requests for a page. */
function watch(page: Page) {
  const csp: string[] = [];
  const analyticsRequests: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error" && /content security policy/i.test(m.text())) csp.push(m.text());
  });
  page.on("request", (r) => {
    if (ANALYTICS.test(new URL(r.url()).pathname))
      analyticsRequests.push(r.method() + " " + r.url());
  });
  return { csp, analyticsRequests };
}

/**
 * React has hydrated the page, so the loader's listeners are attached. Without this
 * a NEGATIVE test ("nothing was sent") could pass vacuously by clicking before the
 * tel: listener exists. Hydration stamps a React fiber key on every host node.
 *
 * Deliberately NOT `waitForLoadState("networkidle")`: when written, the router's
 * prefetch of the then primary-nav `/about` link (a 404) never settled in
 * production. The link is gone, but an explicit hydration signal is the more
 * honest wait for "the listeners are attached" anyway.
 */
async function hydrated(page: Page) {
  await page.waitForFunction(() => {
    const el = document.querySelector("footer");
    return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
  });
  await page.waitForTimeout(250); // passive effects (the listeners) flush just after the commit
}

/** A bounded window for asserting that NOTHING arrived. */
const settle = (page: Page) => page.waitForTimeout(1500);

/** Click the first visible `tel:` link without letting Chromium try to dial. */
async function clickTel(page: Page) {
  await page.evaluate(() =>
    document.addEventListener("click", (e) => {
      if ((e.target as Element | null)?.closest?.('a[href^="tel:"]')) e.preventDefault();
    }),
  );
  await page.locator('a[href^="tel:"]:visible').first().click();
}

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) expect(dbReady).toBe(true);
  await warmUp(baseURL, ["/en"]);
});

test.beforeEach(async ({ request }, testInfo) => {
  if (!dbReady) testInfo.skip();
  await request.get(`${STUB}/__reset`);
});

test("first visit, no choice: nothing reaches the provider — not even on a tel: click", async ({
  page,
  context,
  request,
}) => {
  const w = watch(page);
  await page.goto("/en");
  await expect(page.getByRole("region", { name: CONSENT })).toBeVisible();
  await hydrated(page);
  await clickTel(page);
  await settle(page);
  expect(await page.locator("#glh-plausible").count()).toBe(0);
  expect(w.analyticsRequests).toEqual([]);
  expect(await events(request)).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("plausible_ignore"))).toBeNull();
  const extra = (await context.cookies())
    .map((c) => c.name)
    .filter((n) => n !== "NEXT_LOCALE" && n !== "glh-consent");
  expect(extra).toEqual([]);
});

test("Decline: still nothing reaches the provider", async ({ page, request }) => {
  const w = watch(page);
  await page.goto("/en");
  await hydrated(page);
  const bar = page.getByRole("region", { name: CONSENT });
  await bar.getByRole("button", { name: "Decline" }).click();
  await expect(bar).toBeHidden();
  await clickTel(page);
  await settle(page);
  expect(w.analyticsRequests).toEqual([]);
  expect(await events(request)).toEqual([]);
});

test("Accept after load: script + pageview + a PII-free Phone event, no reload, zero CSP violations", async ({
  page,
  request,
}) => {
  const w = watch(page);
  await page.goto("/en");
  await hydrated(page);
  await settle(page);
  expect(w.analyticsRequests).toEqual([]); // nothing before the choice

  await page.getByRole("region", { name: CONSENT }).getByRole("button", { name: "Accept" }).click();
  // Live (AC4): the loader re-syncs on glh:consent-changed — no navigation happened.
  await expect(page.locator("#glh-plausible")).toHaveCount(1);
  await expect.poll(async () => (await events(request)).map((e) => e.n)).toContain("pageview");

  await clickTel(page);
  await expect
    .poll(async () => (await events(request)).filter((e) => e.n === "Phone").length)
    .toBe(1);

  const all = await events(request);
  const phone = all.find((e) => e.n === "Phone")!;
  expect(phone.d).toBe("glh.test");
  expect(phone.p).toEqual({ path: "/en", locale: "en" });
  // No personal data anywhere in what the provider received (AC3): no dial number.
  const tel = await page.locator('a[href^="tel:"]:visible').first().getAttribute("href");
  const digits = (tel ?? "").replace(/\D/g, "");
  expect(digits.length).toBeGreaterThan(6);
  expect(JSON.stringify(all)).not.toContain(digits);

  // Same-origin only: every analytics request went to THIS origin, through the rewrite.
  expect(w.analyticsRequests.length).toBeGreaterThan(0);
  for (const r of w.analyticsRequests) expect(r).toContain("http://localhost:3102/");
  expect(w.csp, w.csp.join("\n")).toEqual([]);
});

test("revoke via footer Cookie settings: the loaded script stops sending, and stays off after reload", async ({
  page,
  request,
}) => {
  await page.goto("/en");
  await hydrated(page);
  await page.getByRole("region", { name: CONSENT }).getByRole("button", { name: "Accept" }).click();
  await expect.poll(async () => (await events(request)).map((e) => e.n)).toContain("pageview");

  await page.getByRole("contentinfo").getByRole("button", { name: "Cookie settings" }).click();
  await page
    .getByRole("region", { name: CONSENT })
    .getByRole("button", { name: "Decline" })
    .click();
  expect(await page.evaluate(() => localStorage.getItem("plausible_ignore"))).toBe("true");

  await request.get(`${STUB}/__reset`);
  await clickTel(page);
  await settle(page);
  expect(await events(request)).toEqual([]);

  await page.reload();
  await hydrated(page);
  await settle(page);
  expect(await page.locator("#glh-plausible").count()).toBe(0);
  expect(await events(request)).toEqual([]);
});

test("returning visitor with consent granted: loads on first paint", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  await context.addCookies([{ name: "glh-consent", value: "granted", url: baseURL! }]);
  const w = watch(page);
  await page.goto("/en");
  await expect(page.getByRole("region", { name: CONSENT })).toBeHidden();
  await expect(page.locator("#glh-plausible")).toHaveCount(1);
  await expect.poll(async () => (await events(request)).map((e) => e.n)).toContain("pageview");
  expect(w.csp, w.csp.join("\n")).toEqual([]);
});

test("control: the CSP detector really fires on a cross-origin request", async ({ page }) => {
  // Without this, "zero violations" above could be an artefact of a listener that
  // never sees anything. A cross-origin fetch MUST violate `connect-src 'self'`.
  const w = watch(page);
  await page.goto("/en");
  await page.evaluate(() => fetch("http://localhost:3202/health").catch(() => undefined));
  await expect.poll(() => w.csp.length).toBeGreaterThan(0);
});
