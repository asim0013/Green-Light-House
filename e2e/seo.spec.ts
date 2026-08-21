import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 1.9 — base SEO & the thin-content policy, end to end.
 *
 * EVERY METADATA ASSERTION IS MADE AGAINST THE RAW SERVER RESPONSE (`request.get`),
 * never against the hydrated DOM. Two reasons, and both are load-bearing:
 *
 *  1. NFR4/DP-07 require server rendering — client-only SPA is explicitly ruled
 *     out. Metadata that only exists after hydration fails the requirement, and a
 *     DOM-based assertion could not tell the difference.
 *  2. Next 16 STREAMS metadata: resolved `generateMetadata` tags are appended near
 *     `</body>` for JS-executing bots and only injected into `<head>` for
 *     HTML-limited ones. Any assertion scoped to `<head>` would false-fail.
 *
 * Origin-independent by construction: `SITE_URL` is currently set in NEITHER a
 * developer environment nor CI (so `siteOrigin()` returns its localhost default in
 * both), but it WILL be set in staging and production, and these assertions should
 * keep working there. They therefore assert the SHAPE of the URLs — absolute,
 * self-canonical, one per locale — rather than a literal host.
 */

const LOCALES = ["en", "tr", "ru"] as const;

/** Mirrors `allowsIndexing()` so robots.txt can be asserted in ANY environment. */
const INDEXING_ALLOWED = process.env.SITE_ALLOW_INDEXING?.trim().toLowerCase() === "true";

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL);
});

/** `<link rel="canonical" href="…">` from raw HTML, attribute order tolerated. */
function canonicalOf(html: string): string | null {
  const tag = html.match(/<link[^>]+rel="canonical"[^>]*>/i)?.[0];
  return tag?.match(/href="([^"]+)"/i)?.[1] ?? null;
}

/** Every `hreflang` → `href` pair from raw HTML. React emits the attr as `hrefLang`. */
function alternatesOf(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<link[^>]+rel="alternate"[^>]*>/gi) ?? []) {
    const lang = tag.match(/hreflang="([^"]+)"/i)?.[1];
    const href = tag.match(/href="([^"]+)"/i)?.[1];
    if (lang && href) out[lang] = href;
  }
  return out;
}

test.describe("canonical + hreflang (AC1)", () => {
  for (const locale of LOCALES) {
    test(`/${locale} is SELF-canonical and lists every locale plus x-default`, async ({
      request,
    }, testInfo) => {
      if (!dbReady) testInfo.skip();

      const html = await (await request.get(`/${locale}`)).text();

      // Self-canonical: FR42a says canonicals are set "per language". If TR/RU
      // canonicalled to EN, Google would drop the Turkish and Russian trees —
      // so this asserts the URL ENDS with its own locale, not merely that a
      // canonical exists.
      const canonical = canonicalOf(html);
      expect(canonical, "no <link rel=canonical> in the raw server response").not.toBeNull();
      expect(canonical).toMatch(new RegExp(`^https?://.+/${locale}$`));

      const alternates = alternatesOf(html);
      for (const other of LOCALES) {
        expect(alternates[other], `missing hreflang="${other}"`).toMatch(
          new RegExp(`^https?://.+/${other}$`),
        );
      }
      expect(alternates["x-default"], "missing hreflang=x-default").toMatch(/^https?:\/\/.+\/en$/);
    });
  }

  test("the three locales do NOT share one canonical", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const canonicals = await Promise.all(
      LOCALES.map(async (l) => canonicalOf(await (await request.get(`/${l}`)).text())),
    );
    expect(new Set(canonicals).size).toBe(LOCALES.length);
  });

  test("a populated homepage is indexable (FR42a's positive case)", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const html = await (await request.get("/en")).text();

    // POSITIVE assertion, deliberately. The absence check below is not enough on
    // its own: it also passes when the `robots` metadata is missing entirely, so
    // `robots: robotsFor(signals)` could be deleted from the page and this test
    // would stay green — which is the whole of AC5's wiring going unnoticed.
    expect(html).toMatch(/<meta name="robots" content="index, follow"/i);
    expect(html).not.toMatch(/<meta name="robots" content="[^"]*noindex/i);
  });
});

test.describe("sitemap.xml and robots.txt (AC3, AC4)", () => {
  test("sitemap lists the locale homepages and the built industry surfaces", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();

    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    for (const locale of LOCALES) {
      expect(locs.some((u) => u.endsWith(`/${locale}`))).toBe(true);
      // Story 2.1's surfaces. `/industries` is listed because at least one landing
      // page is indexable.
      expect(locs.some((u) => u.endsWith(`/${locale}/industries`))).toBe(true);
      // oil-gas is the populated fixture — 5 products, 2 projects, 4 services.
      expect(locs.some((u) => u.endsWith(`/${locale}/industries/oil-gas`))).toBe(true);
      // Story 2.2: the catalog — never per-category entries (filter views
      // canonical to clean /products).
      expect(xml).not.toContain("category=");
    }

    // FR42a, the NEGATIVE half: an industry whose every block is empty is thin, so
    // it must be `noindex` AND absent here. Measured on the seed, `construction`,
    // `manufacturing` and `nuclear` have no products, projects, certificates or
    // services at all. Without the thin-content gate these would be listed.
    for (const thin of ["construction", "manufacturing", "nuclear"]) {
      expect(xml, `sitemap advertises thin industry ${thin}`).not.toContain(`/industries/${thin}<`);
    }

    // Scope guard: the nav still links to Products/Projects/Services/About and /rfq,
    // none of which exist until Epics 2/3/5. A sitemap of 404s is worse than a small
    // sitemap, so their ABSENCE is the assertion.
    for (const unbuilt of ["/projects", "/services", "/about", "/rfq"]) {
      expect(xml, `sitemap advertises unbuilt route ${unbuilt}`).not.toContain(`${unbuilt}<`);
    }

    // Story 2.2: the catalog appears for EN and TR — and is correctly ABSENT for
    // RU, where no category has a translation, so every rendered string falls
    // back and FR42a rates the page fallback-only. The page itself serves
    // noindex for /ru/products (verified live), so page and sitemap agree — the
    // one-predicate rule demonstrated across a real locale, as /ru/industries/
    // energy demonstrated it in 2.1.
    for (const locale of ["en", "tr"]) {
      expect(locs.some((u) => u.endsWith(`/${locale}/products`))).toBe(true);
    }
    expect(locs.some((u) => u.endsWith("/ru/products"))).toBe(false);

    // i18n sitemaps carry per-locale alternates.
    expect(xml).toContain('rel="alternate"');
    expect(xml).toContain('hreflang="tr"');
  });

  test("robots.txt states the rule this environment should be serving", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    const body = await res.text();

    // `User-Agent: *` alone proves nothing — Next emits it in BOTH branches, so an
    // assertion on it passes just as happily against a catastrophic disallow-all
    // shipped to production. Assert the actual directive instead.
    if (INDEXING_ALLOWED) {
      expect(body).toMatch(/^Allow: \/$/m);
      expect(body).toMatch(/^Disallow: \/api$/m);
      expect(body).not.toMatch(/^Disallow: \/$/m);
    } else {
      expect(body).toMatch(/^Disallow: \/$/m);
      expect(body).not.toMatch(/^Allow: \/$/m);
    }

    // AC4's "references the sitemap" — now true in BOTH branches, so it is
    // assertable in the configuration the suite actually runs in.
    expect(body).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);
  });
});

test.describe("the localized 404 (AC6)", () => {
  // The routes the header and footer link to on EVERY page that STILL do not exist.
  // Before Story 1.9 they served a bare, lang-less, chrome-less 404.
  // `/industries` was removed from this list by Story 2.1, which built it — leaving
  // it here would have failed as a confusing, unrelated-looking 404 assertion.
  // `/products` was removed by Story 2.2, which built it (as `/industries` was by 2.1).
  const UNBUILT = ["/tr/about", "/ru/services"];

  for (const path of UNBUILT) {
    const locale = path.split("/")[1];

    // Deliberately NOT gated on `dbReady`: `global-not-found.tsx` reads no
    // repository, so this path renders identically with Postgres stopped. Gating it
    // would mean a broken 404 skips silently on a developer machine — the Story-1.7
    // lesson about guards that are anti-correlated with correctness.
    test(`${path} → real 404, lang="${locale}", full chrome`, async ({ request }) => {
      const res = await request.get(path);
      // A soft 404 (200 with 404-looking content) is an SEO defect in its own right.
      expect(res.status()).toBe(404);

      const html = await res.text();

      // WCAG 3.1.1 — the defect this AC exists to close. `lang` must match the
      // language the copy is actually written in, not merely be present.
      expect(html).toContain(`<html lang="${locale}"`);
      // NOT the bare internal shell.
      expect(html).not.toContain('id="__next_error__"');
      // Chrome + the skip-link target.
      expect(html).toContain('id="main-content"');
      expect(html).toContain("<header");
      expect(html).toContain("<footer");
      // A 404 must never be indexed.
      expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/i);
    });
  }

  // This one DOES keep the guard: its final step navigates to the homepage, which
  // is database-backed. The 404 itself is not.
  test("the 404 renders localized copy and a working way out", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/tr/about");
    // Turkish copy, not an English fallback — proves the locale reached the render.
    await expect(page.getByRole("heading", { level: 1, name: "Sayfa bulunamadı" })).toBeVisible();

    // EXPERIENCE.md: a "nothing here" state must offer a way onward, never dead-end.
    // Both of these lead somewhere that EXISTS today.
    await expect(page.getByRole("link", { name: "Ana sayfaya dön" })).toBeVisible();
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();

    await page.getByRole("link", { name: "Ana sayfaya dön" }).click();
    await expect(page).toHaveURL(/\/tr$/);
  });
});
