import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";
import { LEGAL } from "../src/config/legal";

/**
 * Story 5.1 — the three legal pages (`/privacy`, `/terms`, `/cookies`), end to end.
 *
 * ⚠️ NAMED `legal.spec.ts` DELIBERATELY. Both Playwright configs route the caching
 * suite on an UNANCHORED `/caching\.spec\.ts/` regex, so nothing containing
 * "caching" may be in this filename (the `contact.spec.ts` lesson).
 *
 * ⚠️ EXPECTED INDEXABILITY IS COMPUTED FROM `LEGAL.approvals`, NOT PINNED. Both
 * gates default false today, so the pages are `noindex` and absent from the
 * sitemap — but this suite asserts the TRANSITION (it reads the same approvals the
 * pages and `sitemap.ts` read), so it stays correct the day a human flips them.
 * A hard-coded `noindex` would go red on review day for no defect — the exact trap
 * the contact spec documents.
 *
 * The pages read NO database, so the render assertions run regardless of DB; only
 * `/sitemap.xml` (which reads the catalogue) is gated on `dbReady`.
 */

const INDEXABLE = LEGAL.approvals.legalReviewed && LEGAL.approvals.translationsReviewed;

const PAGES = [
  { path: "/privacy", hasVersionLine: true },
  { path: "/terms", hasVersionLine: true },
  { path: "/cookies", hasVersionLine: true },
] as const;

const LOCALES = ["en", "tr", "ru"] as const;

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL, ["/en/privacy", "/en/terms", "/en/cookies"]);
});

test.describe("legal pages render in every locale (AC1, AC2)", () => {
  for (const { path } of PAGES) {
    test(`${path} renders an h1 and real body, no literal key path, in all three locales`, async ({
      page,
    }) => {
      for (const locale of LOCALES) {
        const res = await page.goto(`/${locale}${path}`);
        expect(res?.status(), `${locale}${path} must resolve, not 404`).toBe(200);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        const main = page.locator("main");
        // next-intl does not throw on a missing key — it renders the literal
        // `Legal.privacy.title` path to a buyer while EN-only checks stay green.
        await expect(main).not.toContainText("Legal.");
      }
    });
  }

  test("exactly one <h1> per legal page (a11y — AC1)", async ({ page }) => {
    for (const { path } of PAGES) {
      await page.goto(`/en${path}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    }
  });
});

test.describe("the privacy version line — the consent-stamp contract (AC3)", () => {
  test("renders a version line that is no longer the stub", async ({ page }) => {
    await page.goto("/en/privacy");
    const main = page.locator("main");
    await expect(main).toContainText(/Policy version:/i);
    await expect(main).not.toContainText(/stub/i);
  });
});

test.describe("robots and the sitemap agree, in all three locales, in whatever state the gates are in (AC5)", () => {
  test("every legal page's robots tag matches its config state", async ({ page }) => {
    for (const { path } of PAGES) {
      for (const locale of LOCALES) {
        await page.goto(`/${locale}${path}`);
        await expect(
          page.locator('head meta[name="robots"]'),
          `${locale}${path} robots must reflect LEGAL.approvals`,
        ).toHaveAttribute("content", INDEXABLE ? /^index/ : /noindex/);
      }
    }
  });

  test("the sitemap lists the legal pages iff they are indexable", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    for (const { path } of PAGES) {
      for (const locale of LOCALES) {
        const listed = xml.includes(`/${locale}${path}<`);
        expect(
          listed,
          INDEXABLE
            ? `/${locale}${path} is indexable but absent from the sitemap`
            : `/${locale}${path} must not be advertised while its gates are unset`,
        ).toBe(INDEXABLE);
      }
    }
  });
});

test.describe("reachability — footer and RFQ links resolve (AC1)", () => {
  test("all three legal links in the footer resolve", async ({ page }) => {
    for (const { path, label } of [
      { path: "/privacy", label: "Privacy Policy" },
      { path: "/terms", label: "Terms of Use" },
      { path: "/cookies", label: "Cookies" },
    ]) {
      await page.goto("/en");
      const footer = page.getByRole("contentinfo");
      await footer.getByRole("link", { name: label, exact: true }).click();
      await page.waitForURL(new RegExp(`/en${path}$`));
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
  });

  test("the RFQ consent link points at a resolving /privacy", async ({ page }) => {
    await page.goto("/en/rfq");
    const privacyLink = page.locator('main a[href$="/privacy"]').first();
    await expect(privacyLink).toBeVisible();
    await privacyLink.click();
    await page.waitForURL(/\/en\/privacy$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
