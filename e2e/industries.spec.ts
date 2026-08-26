import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 2.1 — industry landing pages, end to end.
 *
 * FIXTURES ARE THE SEED, MEASURED not assumed (live SQL; projects column
 * re-measured 2026-08-25 after the Story 3.1 seed):
 *
 *   industry        products(pub)  projects(pub)  certificates  services
 *   oil-gas               5              2              1           5
 *   fire-safety           3              1              1           0
 *   energy                1              0              0           0
 *   construction          0              0              0           0
 *   manufacturing         0              0              0           0
 *   nuclear               0              0              0           0
 *
 * So `oil-gas` is the populated case and `construction` is the fully empty one.
 *
 * STORY 3.1 ADDED ONE PROJECT, TO `fire-safety`, AND THE INDUSTRY WAS CONSTRAINED.
 * `e2e/seo.spec.ts` asserts that `construction`, `manufacturing` and `nuclear` are
 * THIN and therefore absent from the sitemap; a project in any of them un-thins it
 * and destroys that FR42a proof. `construction` would additionally break this
 * file's five-empty-blocks assertion. `fire-safety` already had products and a
 * certificate, so its indexability is unchanged and `oil-gas` stays at 2 — one
 * below `PROJECT_LIMIT`, which is 3.
 *
 * SERVICES BECAME FIVE, NOT FOUR (Story 2.6). FR23 names five competencies and
 * the seed had merged two of them into one `kitting-logistics` row; 2.6 split it
 * into `project-kitting` + `logistics` so each competency is its own editable
 * content item. Only oil-gas carries services, so only its row changes.
 *
 * CERTIFICATES ARE NO LONGER EMPTY EVERYWHERE. Story 2.3 added the first
 * `DocumentIndustry` rows, giving oil-gas and fire-safety the EN 54 certificate
 * (`fd-9500-en54`); `construction` — this file's EMPTY case — still has none, so
 * every assertion here holds unchanged. This header said "document_industries has
 * ZERO rows" until the 2.3 review caught it: the table is treated as binding
 * fixture documentation by later stories, so a stale row here is a trap, not a
 * comment.
 *
 * Metadata assertions are made against the RAW server response (`request.get`),
 * never the hydrated DOM: Next 16 streams metadata into `<body>` for JS-capable
 * bots, so a `<head>`-scoped locator would false-fail (Story 1.9's finding).
 */

const LOCALES = ["en", "tr", "ru"] as const;
const POPULATED = "oil-gas";
const EMPTY = "construction";

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  // Warm every route SHAPE this spec navigates to. On a cold `.next` the first hit
  // on each pays the on-demand compile inside a test, which fails on the assertion
  // timeout rather than on behaviour (measured: 19.7s for the landing page).
  await warmUp(baseURL, [
    "/en",
    "/en/industries",
    `/en/industries/${POPULATED}`,
    `/en/industries/${EMPTY}`,
    "/en/industries/does-not-exist-xyz",
    "/sitemap.xml",
  ]);
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

test.describe("the /industries index (AC3)", () => {
  test("lists every industry and each one links to its landing page", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/industries");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // Every seeded industry is reachable from here.
    for (const slug of [POPULATED, EMPTY, "energy", "fire-safety", "manufacturing", "nuclear"]) {
      await expect(page.locator(`a[href="/en/industries/${slug}"]`)).toHaveCount(1);
    }

    await page.locator(`a[href="/en/industries/${POPULATED}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/en/industries/${POPULATED}$`));
  });

  test("is reachable from the nav on every page (FR11)", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // `/industries` is already in NAV_ITEMS, so this ASSERTS the structural claim
    // rather than re-implementing it — the nav link now resolves instead of 404ing.
    await page.goto("/en");
    const navLink = page.locator('header a[href="/en/industries"]').first();
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(/\/en\/industries$/);
  });

  test("the homepage industry cards link to their landing pages (Story 1.7's open wire)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en");
    const card = page.locator(`a[href="/en/industries/${POPULATED}"]`).first();
    await expect(card).toBeVisible();
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/en/industries/${POPULATED}$`));
  });
});

test.describe("a populated industry landing page (AC1)", () => {
  test("renders the designed section stack in EXPERIENCE.md's order", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto(`/en/industries/${POPULATED}`);

    // One h1, and it is the sector name — not the site name.
    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toContainText("Oil");

    // The spine's sequence: equipment categories → certificates → services →
    // featured products → projects. Asserting ORDER, not just presence, because the
    // AC enumerates these in a different order than the design specifies.
    const sectionTitles = await page.locator("main h2").allTextContents();
    const indexOf = (needle: string) => sectionTitles.findIndex((t) => t.includes(needle));

    expect(indexOf("What we supply")).toBeGreaterThanOrEqual(0);
    expect(indexOf("What we supply")).toBeLessThan(indexOf("Applicable certificates"));
    expect(indexOf("Applicable certificates")).toBeLessThan(indexOf("Relevant services"));
    expect(indexOf("Relevant services")).toBeLessThan(indexOf("Featured products"));
    expect(indexOf("Featured products")).toBeLessThan(indexOf("Delivered projects"));
  });

  test("shows real content in the blocks the seed populates", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto(`/en/industries/${POPULATED}`);

    // 3 published products (capped from 5 by PRODUCT_LIMIT, which matches the
    // 3-column grid EXPERIENCE.md specifies), 2 projects, 5 services (Story 2.6
    // split the merged kitting-logistics row per FR23; SERVICE_LIMIT was raised
    // 4 → 5 by that story's review so the cap does not clip an FR23 competency).
    await expect(page.locator("article")).toHaveCount(3);

    // ASSERTED, NOT JUST COMMENTED. The 2.6 review found this comment claiming
    // five services while the page rendered four: the seed split pushed oil-gas
    // past SERVICE_LIMIT=4 and `tender-support` (last under slug-ascending +
    // `take`) silently vanished, with nothing here to catch it. The old lone
    // `getByText("Technical selection")` survived only because that slug sorts
    // 4th — it was the last row under the cap.
    const servicesBlock = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: "Relevant services" }) });
    await expect(servicesBlock).toHaveCount(1);
    await expect(servicesBlock.locator("ul > li")).toHaveCount(5);
    for (const name of [
      "Project kitting & configuration",
      "Technical selection",
      "Tender & procurement support",
      "Import / export & customs",
      "Logistics & delivery",
    ]) {
      await expect(servicesBlock, name).toContainText(name);
    }

    // A model designation is machine data and must be rendered.
    await expect(page.getByText("FD-9500").first()).toBeVisible();
  });

  test("NEVER shows a price or a cart affordance (FR2)", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto(`/en/industries/${POPULATED}`);

    // `innerText`, NOT `textContent`: textContent includes <script> contents, and
    // React's flight data is full of `$1`/`$L2` markers, so a currency regex over it
    // matches every RSC page ever rendered. Measured — that false positive is what
    // this comment exists to stop someone reintroducing.
    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/[$€₺]\s?\d/);
    expect(visible.toLowerCase()).not.toContain("add to cart");
    expect(visible.toLowerCase()).not.toContain("add to basket");
    // There is no price field in the schema, so the card cannot render one even by
    // accident — this asserts the rendered result, not the schema.
    expect(visible.toLowerCase()).not.toContain("price on request");
  });

  test("carries the breadcrumb and the co-equal phone action (UX-DR14, FR31)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto(`/en/industries/${POPULATED}`);

    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs).toBeVisible();
    await expect(crumbs.locator('a[href="/en/industries"]')).toBeVisible();
    // The current page is marked, and is NOT a link.
    await expect(crumbs.locator('[aria-current="page"]')).toBeVisible();

    // The phone is a first-class action wherever the RFQ CTA appears.
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
    await expect(page.locator('main a[href="/en/rfq"]').first()).toBeVisible();
  });
});

test.describe("an EMPTY industry landing page (AC2)", () => {
  test("renders every block as a defined empty state, never a blank region", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // On the current seed this is the COMMON path: 3 of 6 industries are fully
    // empty. (Certificates are empty for 4 of 6 since the 2.3 seed — construction
    // is one of them, which is why this page is still the all-empty case.)
    await page.goto(`/en/industries/${EMPTY}`);

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // All five blocks still render their headings...
    for (const title of [
      "What we supply",
      "Applicable certificates",
      "Relevant services",
      "Featured products",
      "Delivered projects",
    ]) {
      await expect(page.getByRole("heading", { name: title })).toBeVisible();
    }

    // ...each with copy rather than nothing. "being published" is the shared
    // sparse-launch phrasing; five blocks, five empty states.
    await expect(page.getByText(/being published/)).toHaveCount(5);

    // No product cards at all, and the page still offers a way onward.
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();
  });

  test("an all-empty industry is thin: noindex, and absent from the sitemap (AC7)", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const html = await (await request.get(`/en/industries/${EMPTY}`)).text();
    expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/i);

    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).not.toContain(`/industries/${EMPTY}<`);
  });

  test("a POPULATED industry is indexable — the positive half of the same predicate", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Positive assertion deliberately: the `not.toMatch(noindex)` form alone also
    // passes when the robots metadata is missing entirely, so `robots: robotsFor(…)`
    // could be deleted from the page and the test would stay green. Story 1.9 shipped
    // exactly that defect twice.
    const html = await (await request.get(`/en/industries/${POPULATED}`)).text();
    expect(html).toMatch(/<meta name="robots" content="index, follow"/i);
  });
});

test.describe("an unknown slug (AC4)", () => {
  // Task 0's decision, with every option measured. No option yields BOTH a 404
  // status and correct chrome on this codebase, so the trade was made in favour of
  // accessibility: a soft 404 with correct `lang`, full chrome and an explicit
  // `noindex`. See IndustryNotFound's header for the full measurement table.
  for (const locale of LOCALES) {
    test(`/${locale}/industries/<unknown> keeps lang="${locale}" and full chrome`, async ({
      request,
    }, testInfo) => {
      // GUARDED, unlike the equivalent tests in seo.spec.ts. Those hit
      // `global-not-found.tsx`, which reads no repository and so renders identically
      // with Postgres stopped. THIS route does not: an unknown slug still goes
      // through `getIndustryBySlug` → Prisma, so with no database the page 500s and
      // these assertions fail for a reason that has nothing to do with the 404.
      if (!dbReady) testInfo.skip();

      const res = await request.get(`/${locale}/industries/does-not-exist-xyz`);
      const html = await res.text();

      // WCAG 3.1.1 — the defect Story 1.9 closed. `lang` must match the language
      // the copy is actually written in.
      expect(html).toContain(`<html lang="${locale}"`);
      // NOT the bare internal shell, which is what plain notFound() produces here.
      expect(html).not.toContain('id="__next_error__"');
      // Chrome + the skip-link target: the user must not be dead-ended.
      expect(html).toContain('id="main-content"');
      expect(html).toContain("<header");
      expect(html).toContain("<footer");
      // A page for a slug that does not exist must never be indexed. This is set
      // EXPLICITLY, because Next only injects it automatically for a 404 status.
      expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/i);
      // ...and it must not advertise a canonical for a page that isn't there.
      expect(canonicalOf(html)).toBeNull();
    });
  }

  test("offers a working way out rather than dead-ending", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/industries/does-not-exist-xyz");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.locator('a[href^="tel:"]').first()).toBeVisible();

    const out = page.locator('main a[href="/en/industries"]').first();
    await expect(out).toBeVisible();
    await out.click();
    await expect(page).toHaveURL(/\/en\/industries$/);
  });

  test("an unknown slug is never listed in the sitemap", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).not.toContain("does-not-exist-xyz");
  });
});

test.describe("SEO and localization on the landing page (AC6, AC7)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}/industries/${POPULATED} is self-canonical with every hreflang`, async ({
      request,
    }, testInfo) => {
      if (!dbReady) testInfo.skip();

      const html = await (await request.get(`/${locale}/industries/${POPULATED}`)).text();

      const canonical = canonicalOf(html);
      expect(canonical, "no <link rel=canonical> in the raw server response").not.toBeNull();
      expect(canonical).toMatch(new RegExp(`^https?://.+/${locale}/industries/${POPULATED}$`));

      const alternates = alternatesOf(html);
      for (const other of LOCALES) {
        expect(alternates[other], `missing hreflang="${other}"`).toMatch(
          new RegExp(`^https?://.+/${other}/industries/${POPULATED}$`),
        );
      }
      expect(alternates["x-default"]).toMatch(
        new RegExp(`^https?://.+/en/industries/${POPULATED}$`),
      );
    });
  }

  test("the three locales do NOT share one canonical", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const canonicals = await Promise.all(
      LOCALES.map(async (l) =>
        canonicalOf(await (await request.get(`/${l}/industries/${POPULATED}`)).text()),
      ),
    );
    expect(new Set(canonicals).size).toBe(LOCALES.length);
  });

  test("untranslated content falls back to EN and says so (FR34a, UX-DR21)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Measured: `energy` has an EN translation only, so in Russian its name falls
    // back — and fallen-back text must carry lang="en" so a screen reader switches
    // voice, plus the visible "shown in English" marker.
    await page.goto("/ru/industries/energy");

    const fallenBack = page.locator('h1 span[lang="en"]');
    await expect(fallenBack).toBeVisible();
    await expect(page.getByText("показано на английском").first()).toBeVisible();
  });

  test("a fully translated industry shows NO fallback marker", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // The negative half: oil-gas has en/tr/ru, so nothing about its NAME falls back.
    // Without this, the marker could render unconditionally and the test above
    // would still pass.
    await page.goto(`/ru/industries/${POPULATED}`);
    await expect(page.locator('h1 span[lang="en"]')).toHaveCount(0);
  });
});
