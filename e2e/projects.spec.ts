import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";

/**
 * Story 3.1 — the Projects section, end to end.
 *
 * FIXTURES (the seed after 3.4, re-measured live against Postgres):
 *
 *   slug                              industry     delivered    media  LINKS  locales
 *   lng-terminal-fire-gas-upgrade     oil-gas      2024-06-01   0      2      en,tr
 *   hospital-fire-suppression         fire-safety  2023-09-01   2      0      en,tr
 *   refinery-gas-detection-retrofit   oil-gas      (null)       0      0      en
 *   standalone-workshop-fitout        (NONE)       2024-02-01   0      0      en,tr
 *
 * ⚠️ THE `LINKS` COLUMN WAS ADDED BY STORY 3.4, and it is the one this table was
 * previously misleading about. The numeric column used to be MEDIA alone, which
 * inverts the truth for the doorway: hospital has 2 media and 0 product links;
 * LNG has 0 media and 2 links. Only LNG produces equipment chips.
 *
 * `standalone-workshop-fitout` is Story 3.4's DEGENERATE fixture: published, but
 * with NO industry and NO linked products, so a doorway opened from it resolves
 * nothing and must render the RFQ exactly as a cold visit does (its AC2). It is
 * deliberately not in construction/manufacturing/nuclear — those are the seed's
 * THIN industries and `seo.spec.ts` proves they are absent from the sitemap.
 *
 * The LNG project's `tr` row deliberately has NO `outcome` — it is the live
 * fixture for per-field fallback (AC2b). The refinery project has no description,
 * no outcome and no photos, so it is FR42a-thin and must be noindex + absent from
 * the sitemap while still rendering. ⚠️ ZERO `ru` rows exist in ANY project, so
 * /ru/projects is fallback-only and FR42a-thin — giving the workshop project a
 * Russian translation un-thinned it and broke two SEO proofs on its first run.
 * Do not add one.
 *
 * Assertions go against RENDERED MARKUP (headings by role, hrefs, `<loc>`), never
 * raw-HTML message strings: next-intl serialises whole namespaces into every
 * page. `innerText`, never `textContent` (flight data).
 */

let dbReady = true;

test.beforeAll(async ({ baseURL }) => {
  dbReady = await probeDbReady();
  await warmUp(baseURL, [
    "/en/projects",
    "/en/projects/lng-terminal-fire-gas-upgrade",
    "/en/projects/hospital-fire-suppression",
    "/tr/projects/lng-terminal-fire-gas-upgrade",
  ]);
});

test.describe("the Projects index (AC1)", () => {
  test("groups published projects under industry headings, cards linking to detail", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/projects");

    // h1 → h2 (group) → h3 (card): the outline the heading-level prop exists for.
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const groups = await page.locator("main h2").allInnerTexts();
    expect(groups.join(" ")).toContain("Oil & Gas");
    expect(groups.join(" ")).toContain("Fire Safety");

    // Both industries' projects link to their detail pages.
    await expect(page.locator('a[href="/en/projects/lng-terminal-fire-gas-upgrade"]')).toHaveCount(
      1,
    );
    await expect(page.locator('a[href="/en/projects/hospital-fire-suppression"]')).toHaveCount(1);

    // The THIN project still renders on the index — thinness gates its DETAIL
    // page's indexability, never its existence in the list.
    await expect(
      page.locator('a[href="/en/projects/refinery-gas-detection-retrofit"]'),
    ).toHaveCount(1);
  });

  test("an industry with no published project is not emitted as a heading", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/projects");

    // energy/construction/manufacturing/nuclear have zero projects. Asserting one
    // by name; the grouping is project-driven, so no project ⇒ no heading.
    const groups = await page.locator("main h2").allInnerTexts();
    expect(groups.join(" ")).not.toContain("Energy");
    expect(groups.join(" ")).not.toContain("Construction");
  });
});

test.describe("the project detail page (AC2, AC11, AC15)", () => {
  test("renders the populated project: title, outcome, delivered date, equipment", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/projects/lng-terminal-fire-gas-upgrade");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "LNG terminal fire & gas upgrade",
    );
    await expect(page.getByText("142 field devices, ATEX Zone 1")).toBeVisible();
    // The two linked catalog products render as real ProductCards — the include no
    // read carried before this story.
    await expect(page.locator("main article")).toHaveCount(2);
  });

  test("omits optional rows rather than rendering empty shells", async ({ page }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // The refinery project: title only. No outcome block, no date row, no
    // equipment section — and still a working page, not a 404.
    await page.goto("/en/projects/refinery-gas-detection-retrofit");

    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Refinery gas-detection retrofit",
    );
    await expect(page.locator("main article")).toHaveCount(0);
    // No photo ⇒ the DESIGNED no-photo band, never a blank region or broken image.
    // ⚠️ `main img` count, NOT a src-prefix selector (3.1 review): next/image
    // rewrites every src to /_next/image?url=…, so `img[src^="/api/projects/"]`
    // matched nothing on ANY page — including the hospital page WITH photos —
    // making the original assertion vacuous. The band is the only possible img
    // in main on a detail page, so a bare img count is the sensitive form.
    await expect(page.locator("main img")).toHaveCount(0);
    // …and the designed band's caption IS there — absence-of-img alone would also
    // pass on a blank region, which is exactly what FR21 forbids.
    await expect(page.locator("main").getByText(/^FIG\./)).toBeVisible();
  });

  test("serves a real photo through the frozen media URL on the fixture that has one", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/projects/hospital-fire-suppression");

    // ⚠️ `next/image` wraps the src in the optimizer URL
    // (`/_next/image?url=%2Fapi%2Fprojects%2F...`), so a selector on the raw path
    // matches nothing. Match on the slug — hyphens survive URL-encoding — then
    // UNWRAP to the frozen URL, because THAT is what this test exists to prove.
    const img = page.locator('main img[src*="hospital-fire-suppression"]');
    await expect(img).toHaveCount(1);

    const src = (await img.getAttribute("src"))!;
    const wrapped = new URL(src, "http://localhost:3000");
    const frozenUrl = wrapped.pathname.startsWith("/_next/image")
      ? decodeURIComponent(wrapped.searchParams.get("url")!)
      : wrapped.pathname;
    expect(frozenUrl).toMatch(/^\/api\/projects\/hospital-fire-suppression\/media\/[a-z0-9-]+$/);

    // ⚠️ THE BYTES, NOT JUST THE TAG (P5): a broken <img> and a working one are
    // identical in the DOM. Fetch the RAW frozen URL — not the optimizer, whose
    // re-encode would mask a handler defect — and prove a decodable PNG comes
    // back with the parsed entry's MIME and no download disposition.
    const res = await request.get(frozenUrl);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    expect(res.headers()["content-disposition"]).toBeUndefined();
    const body = await res.body();
    expect(body.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  test("the doorway CTA carries the project param AND now makes the pre-fill promise", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/projects/lng-terminal-fire-gas-upgrade");

    // Task 0 #7: the HREF carries `?project=<slug>` now, because 3.4's amendment
    // list omits the project surfaces — if 3.1 does not emit it, no story does.
    // Locale-prefixed: next-intl's Link renders /en/rfq, matching every shipped
    // rfqHref assertion (e.g. home.spec.ts's allowlist).
    const doorway = page.locator('a[href="/en/rfq?project=lng-terminal-fire-gas-upgrade"]');
    await expect(doorway).toHaveCount(1);
    // Task 0 #2: FR22's exact label, in the CTA band.
    await expect(doorway).toContainText("I have a similar project");

    // INVERTED BY STORY 3.4 (its Task 0 #20, an Asim decision). Story 3.1 held
    // this copy back because the site must not promise behaviour it does not
    // have; 3.4 made the promise true, so it ships. The assertion flipped from
    // "absent" to "present and specific" rather than simply being deleted —
    // count 0 → the sentence itself, so a silent regression to the held state
    // is still a red test.
    await expect(page.getByText(/pre-filled with this project/i)).toHaveCount(1);

    // …and it stays OFF the index, where no project is in view and "this
    // project's scope" would dangle exactly as the title would.
    await page.goto("/en/projects");
    await expect(page.getByText(/pre-filled with this project/i)).toHaveCount(0);
  });

  test("an unknown slug renders the not-found BODY with noindex — never assert 404 here", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ Deliberately NOT `expect(status).toBe(404)`: the settled decision for all
    // three detail routes is a 200 body (see ProjectNotFound) with self-declared
    // noindex, because Next only injects noindex for a real 404 STATUS.
    await page.goto("/en/projects/zzz-no-such-project");

    await expect(page.getByRole("heading", { level: 1 })).toContainText("isn't published");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);
    // Never dead-end: the way back out exists.
    await expect(page.locator('a[href="/en/projects"]').first()).toBeVisible();
  });
});

test.describe("per-field fallback (AC2b) — the hole measured live", () => {
  test("on /tr the outcome falls back to EN, marked lang=en + visible notice", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // The seeded `tr` row HAS a title but NO outcome. Before this story the
    // outcome silently vanished on /tr with isFallback:false — no lang, no notice.
    await page.goto("/tr/projects/lng-terminal-fire-gas-upgrade");

    // The TITLE is genuinely Turkish: no lang marking on it.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("LNG terminali");

    // The OUTCOME is the EN string, present (not dropped), and marked. The
    // element is anchored — a bare toContain('lang="en"') cannot fail on a page
    // with any other fallback (the 2.6 trap).
    const outcome = page.locator('main span[lang="en"]', {
      hasText: "142 field devices",
    });
    await expect(outcome).toHaveCount(1);

    // …AND the VISIBLE notice (3.1 review — this test's own title claimed it and
    // nothing asserted it, so deleting FallbackNotice kept every suite green: the
    // 2.6 defect class, named in this story's Dev Notes, recurring regardless).
    // Scoped to the paragraph CONTAINING the outcome text, so a notice elsewhere
    // on the page cannot satisfy it. (`filter({hasText})`, not `has:` with an
    // absolutely-rooted locator — that re-queries `main span…` RELATIVE to each
    // candidate <p> and can never match, which is how the first version of this
    // assertion failed against a correct page.)
    const outcomeParagraph = page.locator("main p").filter({ hasText: "142 field devices" });
    await expect(outcomeParagraph.getByText(/İngilizce gösteriliyor/)).toBeVisible();
  });
});

test.describe("SEO agreement (AC4, AC5) — one predicate, both surfaces", () => {
  test("EN and TR indexes are indexable and listed; RU is noindex and absent", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Page side: /ru/projects declares noindex (zero ru rows ⇒ fallback-only).
    await page.goto("/ru/projects");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);

    // Sitemap side: the SAME verdicts, because both call projectsIndexSignals.
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain("http://localhost:3000/en/projects");
    expect(locs).toContain("http://localhost:3000/tr/projects");
    expect(locs).not.toContain("http://localhost:3000/ru/projects");
  });

  test("a thin project detail page is noindex on the page AND absent from the sitemap", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();

    // Page side: the refinery project has no description/outcome/photos.
    await page.goto("/en/projects/refinery-gas-detection-retrofit");
    await expect(page.locator('meta[name="robots"]').first()).toHaveAttribute("content", /noindex/);

    // Sitemap side, same project — and the populated pair IS listed, so the
    // absence above is the predicate talking, not a dead emitter.
    const xml = await (await request.get("/sitemap.xml")).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toContain("http://localhost:3000/en/projects/lng-terminal-fire-gas-upgrade");
    expect(locs).not.toContain("http://localhost:3000/en/projects/refinery-gas-detection-retrofit");
  });
});
