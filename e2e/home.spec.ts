import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/** The rendered text of the first <h1>, tags stripped. */
function headingOf(html: string): string {
  const inner = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  return inner
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The h1 the industry not-found body renders (messages/en.json Industry.notFoundTitle). */
const NOT_FOUND_HEADING = "We do not have a page for that sector";

/**
 * Story 1.7 — projects-first homepage (end-to-end).
 *
 * Proves the surface a unit test cannot: that the real seeded project reaches the
 * hero through the repository, that both conversion paths are reachable, that the
 * discovery sections render, and that the layout survives a phone viewport.
 *
 * Viewports are pinned OFF the 1280 `xl` breakpoint (the Story-1.6 lesson —
 * Playwright's default viewport sits exactly on it, which made specs fragile).
 */

const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };
/** The narrowest viewport worth supporting; Russian is the widest-word locale. */
const NARROW = { width: 320, height: 844 };

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  // `/en/industries/<slug>` was added to this spec by Story 2.1 (the homepage
  // industry cards are wired now), so its compile must be paid here rather than
  // inside a test's assertion timeout.
  await warmUp(baseURL, ["/en", "/en/industries/oil-gas"]);
});

test("hero leads with a delivered project, not a product grid", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  // The h1 is stable localized copy, not DB content (decision Q2).
  await expect(main.getByRole("heading", { level: 1 })).toContainText(
    "Industrial and fire-safety equipment",
  );
  // The proof itself comes from the seeded LNG project — outcome, industry, date.
  await expect(
    main.getByText("142 field devices, ATEX Zone 1, delivered in six weeks."),
  ).toBeVisible();
  await expect(main.getByRole("heading", { level: 2 }).first()).toContainText(
    "LNG terminal fire & gas upgrade",
  );
  await expect(main.getByText("June 2024")).toBeVisible();
});

test("both co-equal CTAs are reachable in the page body", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  // Hero + closing band: the RFQ CTA and the phone appear at both conversion beats.
  await expect(main.getByRole("link", { name: "Request Project Quote" })).toHaveCount(2);
  await expect(main.locator('a[href^="tel:"]')).toHaveCount(2);
});

test("discovery sections render industries, categories and manufacturers", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  await expect(main.getByText("Built for your sector")).toBeVisible();
  await expect(main.getByText("What we supply")).toBeVisible();
  await expect(main.getByText("Manufacturers we supply")).toBeVisible();

  // Seeded rows actually reached the page.
  await expect(main.getByText("Oil & Gas").first()).toBeVisible();
  await expect(main.getByText("Sentra Fire Systems")).toBeVisible();
  // A CHILD category must not appear as a top-level signpost.
  await expect(main.getByText("Flame detectors")).toHaveCount(0);
});

test("discovery items link only to routes that EXIST (FR8)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  // Story 1.7 asserted the stricter "no discovery links at all", because every
  // target 404ed at the time. Story 2.1 BUILT `/industries/<slug>`, so the industry
  // cards are now wired — and the invariant that actually matters survives intact:
  // the homepage body must never link to a route that does not exist (FR8's AC, and
  // the bare-404 problem the 1.6 review escalated).
  const main = page.getByRole("main");

  // Still unbuilt — Products is Story 2.2, Projects is Epic 3, manufacturer pages
  // are phased (FR20).
  for (const route of ["/products", "/projects", "/manufacturers"]) {
    await expect(main.locator(`a[href*="${route}"]`)).toHaveCount(0);
  }

  // The industry cards now resolve. Six seeded industries, six links.
  await expect(main.locator('a[href^="/en/industries/"]')).toHaveCount(6);

  const hrefs = await main
    .locator("a")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
  expect(
    hrefs.every((h) => h.includes("/rfq") || h.startsWith("tel:") || h.includes("/industries/")),
  ).toBe(true);
});

test("every homepage industry link actually resolves (no new 404s)", async ({ page, request }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.goto("/en");

  // The negative proof for the change above: it is not enough that the hrefs exist,
  // they must land on a REAL industry page.
  //
  // ASSERTING status 200 WOULD BE VACUOUS HERE, and that is the whole point of this
  // comment. Story 2.1 made `/[locale]/industries/<anything>` return 200 — a
  // deliberate soft 404 — so a status check passes for `/en/industries/qwertyuiop`
  // just as happily as for a real sector. The assertion has to discriminate on
  // CONTENT: a real page renders the section stack, the not-found body does not.
  const hrefs = await page
    .getByRole("main")
    .locator('a[href^="/en/industries/"]')
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));

  expect(hrefs.length).toBeGreaterThan(0);
  for (const href of hrefs) {
    const res = await request.get(href);
    expect(res.status(), `${href} did not resolve`).toBe(200);

    // Assert on the RENDERED <h1>, not on the raw body. next-intl serializes the
    // whole `Industry` namespace into every page for the client provider, so the
    // not-found copy is present in the HTML of a perfectly good page — a
    // `toContain` check here passes and fails for the wrong reasons. (Same trap as
    // `textContent` including <script>, which bit the price assertion.)
    expect(headingOf(await res.text()), `${href} rendered the not-found body`).not.toBe(
      NOT_FOUND_HEADING,
    );
  }

  // The control that proves the assertion above can actually fail: a slug that does
  // NOT exist must render the not-found body while still returning 200.
  const bogus = await request.get("/en/industries/qwertyuiop-not-real");
  expect(bogus.status()).toBe(200);
  expect(headingOf(await bogus.text())).toBe(NOT_FOUND_HEADING);
});

test("credibility band sits beneath the hero and names no client", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const main = page.getByRole("main");
  const capability = main.getByText("nuclear-grade QA discipline", { exact: false });
  await expect(capability).toBeVisible();
  await expect(main.getByText("ISO 9001")).toBeVisible();

  // FR10: validation layer BENEATH the outcome-led hero, never the headline.
  const h1Box = await main.getByRole("heading", { level: 1 }).boundingBox();
  const capBox = await capability.boundingBox();
  expect(capBox!.y).toBeGreaterThan(h1Box!.y);
});

test("shows no price or e-commerce affordance (FR2)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(DESKTOP);
  await page.goto("/en");

  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of ["add to cart", "add to basket", "buy now", "checkout"]) {
    expect(body).not.toContain(forbidden);
  }
  // No currency figures anywhere. Both orders matter: EN/US puts the symbol first
  // ("$1,200") while TR and RU put it last ("1.200 ₺", "1 200 ₽") — the very
  // locales this site ships — so a symbol-before-number-only guard would miss the
  // two conventions it exists to catch.
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/[$€₺₽]\s?\d/);
  expect(text).not.toMatch(/\d\s?[$€₺₽]/);
  expect(text).not.toMatch(/\b(?:USD|EUR|TRY|RUB)\b/);
});

test("hero stacks on a phone with no horizontal overflow", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(PHONE);
  await page.goto("/en");

  const main = page.getByRole("main");
  const h1Box = await main.getByRole("heading", { level: 1 }).boundingBox();
  const cardBox = await main.getByRole("heading", { level: 2 }).first().boundingBox();

  // Stacked: the proof card sits BELOW the positioning block, not beside it.
  expect(cardBox!.y).toBeGreaterThan(h1Box!.y);
  // And it uses the full column rather than being pinned to its desktop 420px.
  expect(cardBox!.width).toBeGreaterThan(280);

  // The page itself must never scroll sideways (EXPERIENCE § Responsive).
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("does not scroll sideways at 320px in ANY locale", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(NARROW);

  // The 390px check missed this: at 34px the Russian "противопожарное" is wider
  // than a 320px column and overflowed the document by 8px. Русский is the
  // longest-word locale, so all three are checked at the narrowest supported width.
  for (const locale of ["en", "tr", "ru"]) {
    await page.goto(`/${locale}`);
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `horizontal overflow on /${locale} at 320px`).toBeLessThanOrEqual(0);
  }
});

test("both CTAs stay reachable on a phone (FR9: desktop AND mobile)", async ({ page }) => {
  test.skip(!dbReady, "seeded Postgres not reachable");
  await page.setViewportSize(PHONE);
  await page.goto("/en");

  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Request Project Quote" }).first()).toBeVisible();
  await expect(main.locator('a[href^="tel:"]').first()).toBeVisible();
});
