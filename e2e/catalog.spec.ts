import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 2.2 — product catalog & hierarchical category browse, end to end.
 *
 * FIXTURES ARE THE SEED, measured live (re-verified at dev start):
 *
 *   (root) ex-proof            1 published
 *   (root) fire-gas-detection  1 published DIRECT (gd-410) + child
 *   (root) fixed-suppression   0            ← the FR16 empty-category fixture
 *   (root) ppe                 1 published (as-60) + 1 DRAFT (wc-95) ← draft-exclusion fixture
 *     └─ flame-detectors       2 published (fd-9300, fd-9500)
 *
 * Translations: only fire-gas-detection has TR; NOTHING has RU — fallback is the
 * common path, not the edge.
 *
 * Metadata is asserted on the RAW response (Next 16 streams it into <body>), and
 * message strings are NEVER matched against raw HTML — next-intl serializes whole
 * namespaces into every page (the 2.1 vacuity lesson). Rendered markup only.
 */

const LOCALES = ["en", "tr", "ru"] as const;

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL, [
    "/en",
    "/en/products",
    "/en/products?category=fixed-suppression",
    "/en/industries/oil-gas",
  ]);
});

/** `<link rel="canonical" href="…">` from raw HTML, attribute order tolerated. */
function canonicalOf(html: string): string | null {
  const tag = html.match(/<link[^>]+rel="canonical"[^>]*>/i)?.[0];
  return tag?.match(/href="([^"]+)"/i)?.[1] ?? null;
}

test.describe("the catalog page (AC1)", () => {
  test("renders the recovered layout: breadcrumb, H1, subhead, count line, grid", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");

    const h1 = page.getByRole("heading", { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveText("Product catalog");

    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible();
    // The toolbar count line: 5 published products on the seed.
    await expect(page.getByText("5 products", { exact: false })).toBeVisible();
    // The grid renders one card per published product.
    await expect(page.locator("article")).toHaveCount(5);
  });

  test("does NOT render Story 2.5's surfaces — no search, no filters, no sort", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");
    await expect(page.getByRole("searchbox")).toHaveCount(0);
    await expect(page.getByRole("combobox")).toHaveCount(0);
    // No checkbox facets either — the sidebar is 2.5.
    await expect(page.getByRole("checkbox")).toHaveCount(0);
  });

  test("NEVER shows a price or a cart affordance (FR2/FR13)", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");
    // innerText, not textContent — flight data makes any currency regex match raw HTML.
    const visible = await page.locator("body").innerText();
    expect(visible).not.toMatch(/[$€₺]\s?\d/);
    expect(visible.toLowerCase()).not.toContain("add to cart");
    expect(visible.toLowerCase()).not.toContain("add to basket");
  });

  test("cards carry ONLY the datasheet link — 2.4's detail link and Epic 3's inquiry stay absent", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Story 2.3 INVERTED half of this test (the 2.1/2.2 pattern): the card footer
    // now carries its ungated "Datasheet ↓" — for the ONE seeded product with a
    // public datasheet (fd-9500). What must still be absent: product-DETAIL links
    // (2.4 — the card itself is not a link) and "Add to inquiry" (Epic 3, DP-12).
    await page.goto("/en/products");
    await expect(page.locator('article a[href*="/products/"]')).toHaveCount(0);
    await expect(page.locator('article a[href^="/api/documents/"]')).toHaveCount(1);
    for (const card of await page.locator("article").all()) {
      const cardText = (await card.innerText()).toLowerCase();
      expect(cardText).not.toContain("add to inquiry");
    }
    // The datasheet link is the ONLY interactive element any card carries.
    await expect(page.locator("article a, article button")).toHaveCount(1);
  });
});

test.describe("hierarchical category browse (AC2, FR13)", () => {
  test("root chips navigate; a parent shows its child AND its direct product", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");
    // All four roots present as navigation.
    const nav = page.getByRole("navigation", { name: "Categories" });
    for (const slug of ["ex-proof", "fire-gas-detection", "fixed-suppression", "ppe"]) {
      await expect(nav.locator(`a[href*="category=${slug}"]`)).toHaveCount(1);
    }

    // Descend into the parent.
    await nav.locator('a[href*="category=fire-gas-detection"]').click();
    await expect(page).toHaveURL(/category=fire-gas-detection/);

    // Its DIRECT product renders (no roll-up: count is 1, not 3).
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.getByText("GD-410").first()).toBeVisible();
    await expect(page.getByText("1 product", { exact: false }).first()).toBeVisible();

    // The child surfaces as second-row navigation; descend to the leaf.
    const childLink = page.locator('a[href*="category=flame-detectors"]').first();
    await expect(childLink).toBeVisible();
    await childLink.click();
    await expect(page).toHaveURL(/category=flame-detectors/);
    await expect(page.locator("article")).toHaveCount(2);

    // The breadcrumb carries the ascent: leaf view shows the parent as a link.
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.locator('a[href*="category=fire-gas-detection"]')).toHaveCount(1);
  });

  test("the draft product NEVER renders while its published sibling does (AC4)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // ppe holds BOTH: as-60 (published) and wc-95 (draft). This is the fixture
    // 2.1 lacked — the negative proof is a seed fact, not a self-seeded row.
    await page.goto("/en/products?category=ppe");
    await expect(page.locator("article")).toHaveCount(1);
    const visible = await page.locator("body").innerText();
    expect(visible).toContain("AS-60");
    expect(visible).not.toContain("WC-95");
  });
});

test.describe("the FR16 empty state (AC3)", () => {
  test("an empty category renders the defined state with RFQ + phone, never a blank grid", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products?category=fixed-suppression");

    // The defined state — asserted on RENDERED markup, not raw HTML.
    await expect(page.getByRole("heading", { name: "Range expanding" })).toBeVisible();
    // Its CTA terminates at the RFQ (the sanctioned exception) with the co-equal phone.
    await expect(page.locator('main a[href="/en/rfq"]')).toHaveCount(1);
    await expect(page.locator('main a[href^="tel:"]')).toHaveCount(1);
    // Zero cards, count line says 0, and the navigation is still alive.
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Categories" })).toBeVisible();
  });

  test("an UNKNOWN ?category renders the same state at HTTP 200 — never a crash", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const res = await request.get("/en/products?category=does-not-exist-xyz");
    expect(res.status()).toBe(200);

    await page.goto("/en/products?category=does-not-exist-xyz");
    await expect(page.getByRole("heading", { name: "Range expanding" })).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
  });

  test("a MALFORMED ?category is rejected by the slug gate, not queried", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Gate rejects it → treated as absent → the full unfiltered catalog renders.
    await page.goto("/en/products?category=A%26B%20junk");
    await expect(page.locator("article")).toHaveCount(5);
  });
});

test.describe("entry points are wired (AC5)", () => {
  test("a homepage category tile opens its category view", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en");
    const tile = page.locator('main a[href*="/products?category=ppe"]').first();
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(page).toHaveURL(/\/en\/products\?category=ppe/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Product catalog");
  });

  test("an industry page's What-we-supply label opens its category view", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/industries/oil-gas");
    const label = page.locator('main a[href*="/products?category="]').first();
    await expect(label).toBeVisible();
    await label.click();
    await expect(page).toHaveURL(/\/en\/products\?category=/);
  });

  test("the nav's Products link resolves (FR11 structural claim)", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en");
    await page.locator('header a[href="/en/products"]').first().click();
    await expect(page).toHaveURL(/\/en\/products$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Product catalog");
  });
});

test.describe("SEO: one canonical page (AC7)", () => {
  for (const locale of LOCALES) {
    test(`/${locale}/products is self-canonical with every hreflang`, async ({
      request,
    }, testInfo) => {
      if (!dbReady) testInfo.skip();

      const html = await (await request.get(`/${locale}/products`)).text();
      const canonical = canonicalOf(html);
      expect(canonical).not.toBeNull();
      expect(canonical).toMatch(new RegExp(`^https?://.+/${locale}/products$`));
    });
  }

  test("a ?category view canonicals to CLEAN /products — the filter-view rule", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const html = await (await request.get("/en/products?category=ppe")).text();
    const canonical = canonicalOf(html);
    expect(canonical).not.toBeNull();
    // No query string in the canonical, ever.
    expect(canonical).toMatch(/\/en\/products$/);
    expect(canonical).not.toContain("category=");
  });

  test("robots are VIEW-INDEPENDENT: filtered and clean views agree", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // The empty category would be "thin" if signals were computed per-view — the
    // mixed signal the one-predicate rule forbids. Both must say index, follow.
    const clean = await (await request.get("/en/products")).text();
    const filtered = await (await request.get("/en/products?category=fixed-suppression")).text();
    for (const html of [clean, filtered]) {
      expect(html).toMatch(/<meta name="robots" content="index, follow"/i);
    }
  });
});

test.describe("localization (AC6)", () => {
  test("RU: category names fall back to EN with the visible marker", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Measured: NO category has RU. Every chip label is fallen-back EN.
    await page.goto("/ru/products");
    const nav = page.getByRole("navigation", { name: "Категории" });
    await expect(nav.locator('span[lang="en"]').first()).toBeVisible();
    await expect(page.getByText("показано на английском").first()).toBeVisible();
  });

  test("TR: the one translated category shows NO fallback marker", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // fire-gas-detection has TR — the negative half that proves the marker is
    // conditional, not decorative.
    await page.goto("/tr/products");
    const nav = page.getByRole("navigation", { name: "Kategoriler" });
    const translated = nav.locator('a[href*="category=fire-gas-detection"]');
    await expect(translated.locator('span[lang="en"]')).toHaveCount(0);
  });
});
