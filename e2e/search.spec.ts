import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 2.5 — model-number search, filters & the zero-result state, end to end.
 *
 * FIXTURES (the live seed, measured): 5 published products (FD-9500 the only one
 * with a TR name), the DRAFT wc-95 ("Weather Cover WC-95") as the leak canary,
 * 4 manufacturers, 1 series (`flameguard`: fd-9300 + fd-9500).
 *
 * The search is a GET form, so every state is a URL — tests drive URLs directly
 * where the form adds nothing, and drive the FORM itself for UJ2's flow.
 *
 * Assertions are against RENDERED MARKUP (headings by role, hrefs, articles) —
 * next-intl serialises whole namespaces into every page, so raw-HTML string
 * checks are vacuous; and `innerText`, never `textContent` (flight data).
 */

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL, ["/en/products", "/en/products?q=FD-9500", "/tr/products"]);
});

test.describe("model-number search (AC1, AC2 — FR17/FR19)", () => {
  test("UJ2: paste a model into the FORM, land on the result, open the detail page", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products");
    await page.getByRole("searchbox").fill("FD-9500");
    await page.getByRole("search").getByRole("button").click();

    await expect(page).toHaveURL(/q=FD-9500/);
    const cards = page.locator("article");
    await expect(cards).toHaveCount(1);
    await expect(cards).toContainText("Triple-IR");

    // The climax path continues: the card opens the detail page.
    await page.locator('article a[href="/en/products/fd-9500"]').click();
    await expect(page).toHaveURL(/\/en\/products\/fd-9500$/);
  });

  test("paste VARIANTS all find the product — normalization is the point", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // fd-950 rides along: a PREFIX of the normalized model substring-matches —
    // truncated pastes find the product directly, no suggestion detour needed.
    for (const q of ["fd9500", "FD 9500", "fd-9500", "fd-950"]) {
      await page.goto(`/en/products?q=${encodeURIComponent(q)}`);
      await expect(page.locator("article"), `query "${q}"`).toHaveCount(1);
      await expect(page.locator('article a[href="/en/products/fd-9500"]')).toHaveCount(1);
    }
  });

  test("TR: searching a Turkish name finds the TR-named product (FR19)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/tr/products?q=Alev");
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator('article a[href="/tr/products/fd-9500"]')).toHaveCount(1);
    // The TR name renders — not the EN fallback.
    await expect(page.locator("article h3")).toContainText("Alev Dedektörü");
  });

  test("TR: an EN-only name still matches — the fallback contract's other half", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // gd-410 has no TR name; the page shows its EN name, so search matches it.
    await page.goto("/tr/products?q=Fixed%20Gas");
    await expect(page.locator('article a[href="/tr/products/gd-410"]')).toHaveCount(1);
  });

  test("a DRAFT product is unreachable through search — by model or name", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    for (const q of ["WC-95", "Weather"]) {
      await page.goto(`/en/products?q=${encodeURIComponent(q)}`);
      await expect(page.locator("article"), `query "${q}"`).toHaveCount(0);
      const visible = await page.locator("body").innerText();
      expect(visible).not.toContain("Weather Cover");
    }
  });
});

test.describe("filters narrow results (AC3 — FR17's trio)", () => {
  test("manufacturer chip narrows a broad query to one product", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // "detector" matches three products by EN name; gastec makes it one.
    await page.goto("/en/products?q=detector");
    await expect(page.locator("article")).toHaveCount(3);

    await page.locator('a[href*="manufacturer=gastec"]').first().click();
    await expect(page).toHaveURL(/manufacturer=gastec/);
    // The query RODE ALONG — narrowing must not reset the search.
    await expect(page).toHaveURL(/q=detector/);
    await expect(page.locator("article")).toHaveCount(1);
    await expect(page.locator('article a[href="/en/products/gd-410"]')).toHaveCount(1);
  });

  test("series filter without a query returns the series' products", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products?series=flameguard");
    await expect(page.locator("article")).toHaveCount(2);
    await expect(page.locator('article a[href="/en/products/fd-9300"]')).toHaveCount(1);
    await expect(page.locator('article a[href="/en/products/fd-9500"]')).toHaveCount(1);
  });

  test("an unknown well-formed facet value renders the defined empty state, never a crash", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products?manufacturer=zz-nobody");
    await expect(page.locator("article")).toHaveCount(0);
    // No query to echo, so FR16's range-expanding state is the honest one here.
    await expect(page.getByRole("heading", { name: "Range expanding" })).toBeVisible();
  });
});

test.describe("the zero-result state (AC4 — FR17a)", () => {
  test("echoes the query, suggests the near-miss, keeps browse live, pre-fills the RFQ", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // fd9500x does NOT substring-match (the trailing x breaks containment) but
    // sits at 0.667 similarity — the measured sweet spot for a fat-fingered paste.
    await page.goto("/en/products?q=fd9500x");
    await expect(page.locator("article")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /No results for/ })).toContainText("fd9500x");

    // Suggestions are PRODUCT LINKS, not canned queries.
    await expect(page.getByRole("heading", { name: "Did you mean" })).toBeVisible();
    await expect(page.locator('main a[href="/en/products/fd-9500"]')).toHaveCount(1);

    // The RFQ action carries the query — the recorded contract with Story 3.4.
    await expect(page.locator('main a[href="/en/rfq?q=fd9500x"]')).toHaveCount(1);
    // Co-equal phone (FR31), and the category chips stay navigable above.
    await expect(page.locator('main a[href^="tel:"]')).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Categories" }).locator("a").first(),
    ).toBeVisible();
  });

  test("garbage gets the state WITHOUT hallucinated suggestions", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/en/products?q=xyzzy-plugh");
    await expect(page.getByRole("heading", { name: /No results for/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Did you mean" })).toHaveCount(0);
    await expect(page.locator('main a[href="/en/rfq?q=xyzzy-plugh"]')).toHaveCount(1);
  });

  test("RU: the state renders in the RU register", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();

    await page.goto("/ru/products?q=zzz-nothing");
    await expect(page.getByRole("heading", { name: /ничего не найдено/ })).toBeVisible();
  });
});

test.describe("SEO invariants (AC5)", () => {
  test("search and facet views canonical to clean /products with view-independent robots", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    const clean = await (await request.get("/en/products")).text();
    const cleanRobots = clean.match(/name="robots" content="([^"]*)"/)?.[1];
    // The assertion below compares each view against this value — so it is only
    // meaningful if the value EXISTS. Without this line the whole test passes
    // when the robots meta is missing from every view (2.5 review).
    expect(cleanRobots).toBeTruthy();

    for (const view of ["?q=FD-9500", "?q=zzz-nothing", "?manufacturer=gastec&q=detector"]) {
      const html = await (await request.get(`/en/products${view}`)).text();
      expect(html, view).toContain('rel="canonical" href="http://localhost:3000/en/products"');
      // Robots agree with the CLEAN view — even on a zero-result query. The
      // emptiness of one view is not the emptiness of the surface.
      expect(html.match(/name="robots" content="([^"]*)"/)?.[1], view).toBe(cleanRobots);
    }
  });
});

test.describe("filters compose in EVERY direction (AC3 — 2.5 review)", () => {
  test("submitting a new query KEEPS the active facets — the hidden inputs are load-bearing", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Deleting SearchForm's three hidden inputs left the entire suite green: no
    // test ever submitted the form while a facet was active. A GET form
    // structurally cannot carry params that are not fields.
    await page.goto("/en/products?manufacturer=sentra-fire&category=flame-detectors");
    await page.getByRole("searchbox").fill("detector");
    await page.getByRole("search").getByRole("button").click();

    await expect(page).toHaveURL(/q=detector/);
    await expect(page).toHaveURL(/manufacturer=sentra-fire/);
    await expect(page).toHaveURL(/category=flame-detectors/);
  });

  test("clicking a CATEGORY chip keeps the active search — the third facet composes too", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Story 2.2's CategoryChips emitted bare /products?category=<slug> hrefs, so
    // choosing a category while searching silently discarded q (and the other
    // facets) — the buyer narrowed and got MORE results. All three facets now
    // build their hrefs from one shared composer.
    await page.goto("/en/products?q=detector");
    await expect(page.locator("article")).toHaveCount(3);

    // A ROOT chip: an uncategorised search view shows only the root row, so
    // `flame-detectors` (a child) is not on screen here.
    const nav = page.getByRole("navigation", { name: "Categories" });
    await nav.locator('a[href*="category=fire-gas-detection"]').first().click();

    await expect(page).toHaveURL(/category=fire-gas-detection/);
    await expect(page).toHaveURL(/q=detector/);
    // Narrowing must NARROW: gd-410 is the category's only DIRECT match (2.2's
    // no-roll-up rule), down from the unfiltered three.
    await expect(page.locator("article")).toHaveCount(1);
  });

  test("'All products' does not claim to be the current page while a search narrows the view", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Two contradictory current-markers per page: the chip said aria-current
    // while ?q= was filtering (2.5 review).
    await page.goto("/en/products?q=detector");
    const nav = page.getByRole("navigation", { name: "Categories" });
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(0);

    // On the genuinely unfiltered view it IS current.
    await page.goto("/en/products");
    await expect(nav.locator('a[aria-current="page"]')).toHaveCount(1);
  });
});

test.describe("input hardening (2.5 review)", () => {
  test("control bytes and split emoji do not 500 the page", async ({ request }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // ?q=%00 reached Postgres and threw SQLSTATE 22021; an emoji straddling the
    // 80-unit cap left a lone surrogate that Prisma could not serialize.
    const split = "a".repeat(79) + "\u{1F525}";
    for (const q of ["%00", "fd%009500", encodeURIComponent(split)]) {
      const res = await request.get(`/en/products?q=${q}`);
      expect(res.status(), `query "${q}"`).toBe(200);
    }
  });

  test("a one-character query is treated as no query, not as a catalogue-wide scan", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Simultaneously the broadest substring match and the least indexable shape.
    await page.goto("/en/products?q=a");
    // No zero-result state, no echoed query — just the ordinary catalogue.
    await expect(page.getByRole("heading", { name: /No results for/ })).toHaveCount(0);
    await expect(page.locator("article")).toHaveCount(5);
  });
});
