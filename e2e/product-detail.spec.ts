import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";
import { probeStorageReady } from "./storageReady";

/**
 * Story 2.4 — the product detail page, end to end.
 *
 * FIXTURES (measured against the live seed, not assumed):
 *   fd-9500  published · 4 attributes · 3 documents (2 PUBLIC + 1 PRIVATE) ·
 *            EN + TR translations · category `flame-detectors`, sibling fd-9300
 *   as-60    published · 3 attributes · NO documents · its only category sibling
 *            is `wc-95`, which is DRAFT — so its related block is genuinely empty
 *   wc-95    DRAFT — the negative fixture for "only published products are
 *            reachable". Its content must never render.
 *
 * `fd-9500-datasheet-internal` is the private v2 datasheet seeded by the 2.3
 * review. It is the HIGHEST version on the most-populated product, so a broken
 * `isPublic` filter surfaces it FIRST — which is exactly why it makes a good
 * canary here.
 *
 * Assertions go against RENDERED MARKUP, never raw HTML: next-intl serialises the
 * whole message namespace into every page, so `toContain("Related products")`
 * passes even when no such section rendered. Measured during this story — the
 * naive check reported the section present on a page that omits it.
 */

let dbReady = true;
let storageReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  storageReady = await probeStorageReady();
  await warmUp(baseURL, ["/en/products", "/en/products/fd-9500", "/en/products/as-60"]);
});

test.describe("a populated product page (AC1, AC5)", () => {
  test("renders identity, the full spec table, and its public documents", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products/fd-9500");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Triple-IR (IR³) Flame Detector",
    );
    // The model is machine data and renders in the data font.
    await expect(page.locator("main")).toContainText("FD-9500");
    // Manufacturer as TEXT — FR20 (a page per manufacturer) is phased, so it must
    // NOT be a link (DP-12).
    await expect(page.locator("main")).toContainText("Sentra Fire");
    await expect(page.locator('main a[href*="/manufacturers/"]')).toHaveCount(0);

    // ALL FOUR attributes, not the card's two. `hazArea` humanises to "Haz area"
    // — capitalisation is preserved only for acronyms (ATEX, IP66).
    const specs = page.getByRole("heading", { name: "Technical specifications" });
    await expect(specs).toBeVisible();
    const main = page.locator("main");
    for (const label of ["Detection", "Enclosure", "Haz area", "Response"]) {
      await expect(main).toContainText(label);
    }
  });

  test("lists PUBLIC documents only — the private v2 datasheet never appears", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products/fd-9500");

    const downloads = page.locator('main a[href^="/api/documents/"]');
    await expect(downloads).toHaveCount(2);
    await expect(page.locator('main a[href="/api/documents/fd-9500-datasheet"]')).toHaveCount(1);
    await expect(page.locator('main a[href="/api/documents/fd-9500-en54"]')).toHaveCount(1);
    // The confidentiality boundary, asserted directly.
    await expect(
      page.locator('main a[href="/api/documents/fd-9500-datasheet-internal"]'),
    ).toHaveCount(0);

    // The a11y floor: format + size in text, inside the link, so the accessible
    // name carries them.
    await expect(downloads.first()).toContainText("PDF");
  });

  test("a listed document actually downloads — ungated, no form", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady || !storageReady) testInfo.skip();

    await page.goto("/en/products/fd-9500");
    const href = await page.locator('main a[href^="/api/documents/"]').first().getAttribute("href");
    expect(href).toBeTruthy();

    // FR14's "a product with documents exposes WORKING download links" — the
    // response IS the file, so the link is only proven by fetching it.
    const res = await request.get(href!);
    expect(res.status()).toBe(200);
    expect((await res.body()).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("carries the breadcrumb, the co-equal phone action, and NO price (FR2)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products/fd-9500");

    const crumbs = page.getByRole("navigation", { name: /breadcrumb/i });
    await expect(crumbs.locator('a[href="/en/products"]')).toHaveCount(1);
    // Full ancestry from the tree walk — the product's category is in the trail.
    await expect(crumbs).toContainText("Flame detectors");

    await expect(page.locator('main a[href="/en/rfq"]')).toHaveCount(1);
    await expect(page.locator('main a[href^="tel:"]')).toHaveCount(1);

    // `innerText`, not textContent: the latter includes <script>, and React flight
    // data makes any currency regex match on every RSC page.
    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/[$€₺]\s?\d/);
    expect(visible.toLowerCase()).not.toContain("add to inquiry");
  });

  test("shows related products from the same category", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products/fd-9500");
    await expect(page.getByRole("heading", { name: "Related products" })).toBeVisible();
    // fd-9300 shares `flame-detectors`; the product itself is never in its own list.
    await expect(page.locator('main a[href="/en/products/fd-9300"]')).toHaveCount(1);
    await expect(page.locator('main article a[href="/en/products/fd-9500"]')).toHaveCount(0);
  });
});

test.describe("empty sections are OMITTED, never blank regions (AC7)", () => {
  test("a product with no documents and no siblings renders neither section", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // as-60's only category sibling is the DRAFT wc-95, so "related" is genuinely
    // empty — which also proves the published filter on that read.
    await page.goto("/en/products/as-60");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Technical specifications" })).toBeVisible();
    // Headings, not raw HTML — the message namespace is serialised into the page.
    await expect(page.getByRole("heading", { name: "Documents" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Related products" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Compatible accessories" })).toHaveCount(0);
    await expect(page.locator("main article")).toHaveCount(0);
  });

  test("accessory compatibility is omitted everywhere — the relation has no rows", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // `accessory_compatibilities` is empty repo-wide (FR14's phased half), so the
    // omitted branch is the ONLY reachable one on this seed. The populated branch
    // is proven by a self-seeded integration test instead.
    await page.goto("/en/products/fd-9500");
    await expect(page.getByRole("heading", { name: "Compatible accessories" })).toHaveCount(0);
  });
});

test.describe("unreachable products (AC2, AC3, AC4)", () => {
  test("a DRAFT product renders the not-found body and never its content", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products/wc-95");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "We do not have a page for that product",
    );
    // The draft's real content must not leak — not its name, not its attributes.
    const visible = await page.locator("body").innerText();
    expect(visible).not.toContain("Weather Cover");
    expect(visible).not.toContain("316 SS");
  });

  test("unknown and malformed slugs land on the same body", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    for (const slug of ["zz-not-a-product", "A%26B%20junk"]) {
      await page.goto(`/en/products/${slug}`);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "We do not have a page for that product",
      );
    }
  });

  test("the not-found body is noindex, and never dead-ends", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Option E: a deliberate 200 with an EXPLICIT noindex — Next injects that
    // automatically only for a real 404 status. Asserted on the RAW response
    // because Next streams metadata into <body> for JS-capable bots.
    const res = await request.get("/en/products/wc-95");
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="robots" content="noindex');
    // No canonical or hreflang: they would advertise a page that isn't there.
    expect(html).not.toContain('rel="canonical" href="http://localhost:3000/en/products/wc-95"');
    // Never a dead end (EXPERIENCE.md § State Patterns).
    expect(html).toContain('href="/en/products"');
  });
});

test.describe("SEO and localization (AC8)", () => {
  test("a populated page is self-canonical with every hreflang", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const html = await (await request.get("/en/products/fd-9500")).text();
    expect(html).toContain('rel="canonical" href="http://localhost:3000/en/products/fd-9500"');
    for (const locale of ["en", "tr", "ru"]) {
      expect(html).toContain(
        `hrefLang="${locale}" href="http://localhost:3000/${locale}/products/fd-9500"`,
      );
    }
    expect(html).toContain('name="robots" content="index');
  });

  test("a fallback-only locale is noindex and absent from the sitemap", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Nothing in the seed carries RU, so every identity field on /ru falls back —
    // fallback-only, therefore thin. The emergent-but-correct behaviour 2.1 and
    // 2.2 both hit.
    const ru = await (await request.get("/ru/products/fd-9500")).text();
    expect(ru).toContain('name="robots" content="noindex');

    // TR is the positive half of the same predicate: fd-9500 HAS a TR name.
    const tr = await (await request.get("/tr/products/fd-9500")).text();
    expect(tr).toContain('name="robots" content="index');

    // INCLUSION is decided by <loc>, NOT by the raw document. Every entry also
    // carries the full hreflang map — deliberately, so page and sitemap advertise
    // the same alternate set — which means `/ru/products/fd-9500` DOES appear in
    // the file as an xhtml:link. Asserting on raw text would fail for the wrong
    // reason; the real question is whether RU has a <loc> of its own.
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain("http://localhost:3000/en/products/fd-9500");
    expect(locs).toContain("http://localhost:3000/tr/products/fd-9500");
    expect(locs).not.toContain("http://localhost:3000/ru/products/fd-9500");
    // Never the draft, in any locale.
    expect(locs.filter((loc) => loc.includes("/products/wc-95"))).toEqual([]);
  });
});

test.describe("the card wires into the page (AC6)", () => {
  test("clicking a catalog card opens its detail page", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");
    // The heading link carries the product's own accessible name.
    await page.locator('article a[href="/en/products/fd-9500"]').first().click();
    await expect(page).toHaveURL(/\/en\/products\/fd-9500$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Triple-IR");
  });

  test("the datasheet link stays independently clickable under the stretched overlay", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // The overlay covers the card so the whole surface opens the detail page; the
    // footer anchor is raised above it. If the z-order regressed, this click would
    // navigate to the detail page instead of hitting the download URL.
    await page.goto("/en/products");
    const datasheet = page.locator('article a[href^="/api/documents/"]').first();
    await expect(datasheet).toBeVisible();
    // `elementFromPoint` takes VIEWPORT coordinates, so the link has to be on
    // screen before its box is meaningful — below the fold it returns null.
    await datasheet.scrollIntoViewIfNeeded();
    const box = await datasheet.boundingBox();
    expect(box).not.toBeNull();
    // The element that actually receives a click at the datasheet link's centre
    // must be the datasheet anchor, not the overlay.
    const targetHref = await page.evaluate(
      ({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return el?.closest("a")?.getAttribute("href") ?? null;
      },
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
    );
    expect(targetHref).toMatch(/^\/api\/documents\//);
  });
});
