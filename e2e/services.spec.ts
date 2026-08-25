import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 2.6 — the Services page, end to end.
 *
 * FIXTURES (the seed after 2.6's Q1 split, measured): FIVE services, one per FR23
 * competency — `project-kitting`, `technical-selection`, `tender-support`,
 * `import-export`, `logistics` — each with an EN name AND description (Q2's
 * backfill), and NONE with a TR or RU translation. So `/tr/services` and
 * `/ru/services` are fallback-only ⇒ noindex ⇒ absent from the sitemap, and that
 * is the correct answer, not a bug.
 *
 * Assertions go against RENDERED MARKUP (headings by role, hrefs, `<loc>`), never
 * raw-HTML message strings: next-intl serialises whole namespaces into every
 * page. `innerText`, never `textContent` (flight data).
 */

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL, ["/en/services", "/tr/services", "/ru/services", "/sitemap.xml"]);
});

test.describe("the Services page (AC1, AC2, AC3)", () => {
  test("presents all five FR23 competencies with their descriptions", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/services");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Services");

    // FR23 names five: project kitting/configuration, technical selection, tender
    // support, import/export, logistics. The seed row that merged the first and
    // last was split in 2.6 so each is its own content item.
    const main = page.locator("main");
    for (const name of [
      "Project kitting & configuration",
      "Technical selection",
      "Tender & procurement support",
      "Import / export & customs",
      "Logistics & delivery",
    ]) {
      await expect(main, name).toContainText(name);
    }

    // Each is a real content item, not a bare heading — descriptions were NULL on
    // every seeded row before 2.6.
    await expect(main).toContainText("per work package");
    await expect(main).toContainText("Türkiye–Russia corridor");
  });

  test("renders exactly five service items", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/services");
    // Scoped to the LIST, not to main: the breadcrumb is inside <main> too and
    // its <ol><li> would inflate a bare "main li" count.
    await expect(page.locator("main ul > li")).toHaveCount(5);
  });

  test("the nav link resolves — the chrome-first promise from Story 1.6", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // `/services` has been in NAV_ITEMS since 1.6 and rendered the localized 404
    // until this story.
    await page.goto("/en");
    const navLink = page.locator('header a[href="/en/services"]').first();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/\/en\/services$/);
    // ASSERT THE DESTINATION, not merely that some h1 exists: Next's localized
    // not-found renders at the SAME URL with a visible `<h1>Page not found</h1>`,
    // so `toHaveURL` + `h1 visible` both hold on the very 404 this test is named
    // for (2.6 review). The heading TEXT and the list are what separate them.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Services");
    await expect(page.locator("main ul > li")).toHaveCount(5);
  });

  test("carries the RFQ and co-equal phone paths, and NO price (FR2, FR31)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/services");
    await expect(page.locator('main a[href="/en/rfq"]')).toHaveCount(1);
    await expect(page.locator('main a[href^="tel:"]')).toHaveCount(1);

    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/[$€₺]\s?\d/);
  });
});

test.describe("localization and SEO (AC1, AC5)", () => {
  test("EN is self-canonical with every hreflang and is indexable", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const html = await (await request.get("/en/services")).text();
    expect(html).toContain('rel="canonical" href="http://localhost:3000/en/services"');
    for (const locale of ["en", "tr", "ru"]) {
      expect(html, locale).toContain(
        `hrefLang="${locale}" href="http://localhost:3000/${locale}/services"`,
      );
    }
    expect(html).toContain('name="robots" content="index');
  });

  test("TR and RU fall back visibly and are noindex + absent from the sitemap", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Every service is EN-only, so both non-default locales are fallback-only.
    for (const [locale, notice] of [
      ["tr", "(İngilizce gösteriliyor)"],
      ["ru", "(показано на английском)"],
    ]) {
      const res = await request.get(`/${locale}/services`);
      // STATUS FIRST. The localized 404 emits `content="noindex"` too (measured),
      // so on its own the robots assertion below is satisfied by a route that
      // stopped existing — and 2.6 removed /ru/services from seo.spec's UNBUILT
      // list, leaving nothing anywhere asserting this URL resolves (2.6 review).
      expect(res.status(), locale).toBe(200);
      expect(await res.text(), locale).toContain('name="robots" content="noindex');

      // The VISIBLE FallbackNotice (FR34a), not just `lang=`. The lang attribute
      // sits on the NAME span; the notice is a sibling span carrying NO lang, so
      // a `span[lang="en"]` locator cannot see it — deleting `<FallbackNotice/>`
      // from ServiceList kept the entire suite green, on this surface AND on the
      // industry pages that now share the component (2.6 review). Both locales,
      // because RU previously had no rendering assertion at all.
      await page.goto(`/${locale}/services`);
      await expect(page.locator('main span[lang="en"]').first()).toBeVisible();
      await expect(page.locator("main").getByText(notice).first()).toBeVisible();
    }

    // INCLUSION is decided by <loc>, never raw text: every entry also carries the
    // full hreflang map, so /ru/services legitimately appears as an xhtml:link.
    // Comparing raw text here would fail for the wrong reason (2.4's lesson).
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain("http://localhost:3000/en/services");
    expect(locs).not.toContain("http://localhost:3000/tr/services");
    expect(locs).not.toContain("http://localhost:3000/ru/services");
  });
});
