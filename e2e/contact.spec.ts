import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 3.8 — the Contact page, end to end.
 *
 * ⚠️ NAMED `contact.spec.ts` DELIBERATELY. Both Playwright configs route on the
 * same UNANCHORED `/caching\.spec\.ts/` regex, so a file called
 * `contact-caching.spec.ts` would silently move into the caching suite and run
 * against a different server on a different port. Do not rename this to anything
 * containing "caching".
 *
 * ⚠️ THE PAGE UNDER TEST IS UNCONFIGURED BY DESIGN. GLH has supplied no address,
 * inquiry email or registration details, so `src/config/contact.ts` is all-null
 * and the channels zone renders NOTHING. Every assertion here is written to hold
 * in that state AND to keep holding once the values land — which is why the
 * channel assertions are conditional on the configured state rather than
 * hard-coded to today's emptiness. A test that asserted "no email link" would
 * turn green-to-red on the day GLH delivers, for no defect.
 */

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  if (process.env.CI) {
    expect(
      dbReady,
      "CI provisions Postgres — an unreachable DB here is a defect, not an environment",
    ).toBe(true);
  }
  await warmUp(baseURL, ["/en/contact", "/tr/contact"]);
});

test.describe("the Contact page (AC1, AC2, AC6)", () => {
  test("renders in all three locales with no literal key path", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ THE FAILURE THIS CATCHES IS SILENT AND LOCALE-SHAPED. next-intl here does
    // NOT throw on a missing key and `t()` is not compiler-checked, so a `Contact`
    // key missing from one catalogue renders the literal string `Contact.title`
    // to a buyer while every EN-only assertion stays green. Story 3.3's review
    // found this class in the email copy; 3.4 closed it for the RFQ banner.
    for (const locale of ["en", "tr", "ru"] as const) {
      await page.goto(`/${locale}/contact`);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      const main = page.locator("main");
      await expect(main).not.toContainText("Contact.");
      await expect(main).not.toContainText("Nav.");
      await expect(main).not.toContainText("Rfq.");
    }
  });

  test("mounts the SAME inquiry form as /rfq, posting to the same endpoint (AC2)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/contact");
    // The island's own controls, not a second form: if /contact ever grew its own
    // lighter form these ids would not exist.
    await expect(page.locator("#rfq-name")).toBeVisible();
    await expect(page.locator("#rfq-email")).toBeVisible();
    await expect(page.locator("#rfq-project-details")).toBeVisible();
    // ...and exactly ONE form on the page — a second would mean a duplicate path.
    await expect(page.locator("form")).toHaveCount(1);
  });

  test("carries the phone as CHROME — the same TalkCard /rfq mounts (AC8)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ The number is `SITE.phone`'s placeholder and that is CORRECT here: the
    // header, the hero and every industry page already show it. AC1's
    // configured-channels rule governs the NEW channels only.
    await page.goto("/en/contact");
    const tel = page.locator('main a[href^="tel:"]');
    await expect(tel.first()).toBeVisible();
  });

  test("is reachable from the footer on every page (AC6)", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // The link ships now even though the page is noindex — a buyer can reach it,
    // a crawler is told not to list it. Those are different questions.
    await page.goto("/en");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Contact", exact: true })).toBeVisible();
    await footer.getByRole("link", { name: "Contact", exact: true }).click();
    // ⚠️ `waitForURL`, NOT `toHaveURL`. This is a client-side transition into a
    // route the dev server may still be compiling, and `toHaveURL`'s 15s
    // assertion window is not a navigation timeout — it polls, then fails while
    // the navigation is still legitimately in flight. `rfq.spec.ts` uses
    // `waitForURL` for the same reason. The assertion's intent is "the footer
    // link goes to /contact", never "it gets there within 15 seconds on a cold
    // compile".
    await page.waitForURL(/\/en\/contact$/);
  });

  test("does NOT appear in the primary nav — the header is unchanged (AC6)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ THE GUARD THE EXISTING ASSERTIONS CANNOT PROVIDE. `SiteHeader.test.tsx`
    // and `global-layout.spec.ts` both iterate a hard-coded five nav keys and
    // assert by NAME, so adding a sixth item to `NAV_ITEMS` would leave them
    // GREEN. This is what makes "the footer slot is a third array" a fact.
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/en");
    await expect(page.getByRole("banner").getByRole("link", { name: "Contact" })).toHaveCount(0);
  });
});

test.describe("Contact page — indexability and third parties (AC3, AC5)", () => {
  test("is noindex in all three locales while unconfigured, and absent from the sitemap", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ BOTH SIDES, ASSERTED TOGETHER. The robots tag and the sitemap have
    // silently drifted THREE times in this project (1.9, the 2.1 review, the 2.4
    // review), and `seo.spec.ts`'s assertions are per-route — /contact is in none
    // of them, so without this nothing would notice a disagreement.
    for (const locale of ["en", "tr", "ru"] as const) {
      await page.goto(`/${locale}/contact`);
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    }

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml, "/contact must not be advertised while it is a placeholder").not.toContain(
      "/contact",
    );
  });

  test("issues NO third-party request — no map embed, script or tile (AC3, FR46)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ ASSERTED ON THE REQUEST LOG, NOT THE MARKUP. Checking for an `<iframe>`
    // would miss a script-injected map, a tile fetch or a font pull — and this AC
    // exists because an embed sets third-party cookies BEFORE consent, which FR46
    // forbids and Story 5.2 owns.
    const foreign: string[] = [];
    page.on("request", (req) => {
      const url = new URL(req.url());
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") foreign.push(req.url());
    });

    await page.goto("/en/contact");
    await page.waitForLoadState("networkidle");

    expect(foreign, "a third-party request escaped from /contact").toEqual([]);
  });
});
