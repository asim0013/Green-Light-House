import { test, expect } from "@playwright/test";
import { probeDbReady, warmUp } from "./dbReady";
import { CONTACT, configuredChannels, isFullyConfigured, mapsUrl } from "../src/config/contact";
import { slaTextFor } from "../scripts/sla-fixtures";

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
 * and the channels zone renders NOTHING.
 *
 * ⚠️ AND EVERY ASSERTION HERE IS DERIVED FROM THAT CONFIG RATHER THAN PINNED TO
 * IT — WHICH THE PREVIOUS VERSION OF THIS DOCSTRING CLAIMED WHILE THE FILE DID
 * THE OPPOSITE. It promised "the channel assertions are conditional on the
 * configured state rather than hard-coded to today's emptiness"; there were no
 * channel assertions at all, and its indexability test hard-coded `noindex` in
 * three locales plus the sitemap's exclusion, so the day GLH delivered it would
 * have gone red for no defect. The whole configured-channels rule — the one
 * behaviour this page is built around — had zero end-to-end coverage. Both are
 * fixed below: the expected state is COMPUTED from `configuredChannels(CONTACT)`
 * and `isFullyConfigured(CONTACT)`, the same predicates the page and the sitemap
 * read, so this suite is correct in either state and asserts the transition
 * rather than one side of it.
 */

let dbReady = true;

/** Computed once from the same module the page renders from. */
const CHANNELS = configuredChannels(CONTACT);
const PUBLISHED = isFullyConfigured(CONTACT);

const E2E_EMAIL_PREFIX = "zzz-e2e-lead-";
let emailSeq = 0;

function uniqueEmail(workerIndex: number): string {
  emailSeq += 1;
  return `${E2E_EMAIL_PREFIX}w${workerIndex}-p${process.pid}-${Date.now()}-${emailSeq}@example.com`;
}

let ipSeq = 0;

/** Own limiter bucket per worker — the 3.7a rule: consuming POSTs never share. */
function fakeClientIp(workerIndex: number): string {
  ipSeq += 1;
  const third = (process.pid % 0xffff).toString(16);
  const fourth = (((workerIndex + 1) * 0x100 + (ipSeq % 0x100)) % 0xffff).toString(16);
  return `2001:db8:${third}:${fourth}::1`;
}

interface PrismaLike {
  lead: {
    findUnique(args: {
      where: { reference: string };
    }): Promise<{ email: string; source: string } | null>;
    deleteMany(args: { where: { email: { startsWith: string } } }): Promise<{ count: number }>;
  };
  industry: {
    findMany(args: { select: { id: boolean } }): Promise<{ id: string }[]>;
    findFirst(args: {
      where: { translations: { some: { description: { not: null } } } };
      select: { id: boolean; translations: { select: { description: boolean }; take: number } };
    }): Promise<{ id: string; translations: { description: string | null }[] } | null>;
  };
  $disconnect(): Promise<void>;
}

async function withPrisma<T>(fn: (db: PrismaLike) => Promise<T>): Promise<T> {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // ambient env
  }
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient() as unknown as PrismaLike;
  try {
    return await fn(db);
  } finally {
    await db.$disconnect();
  }
}

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

test.afterAll(async ({}, testInfo) => {
  if (!dbReady) return;
  // Per-worker, per-process — the whole-prefix sweep is `e2e/global-teardown.ts`,
  // where nothing is in flight (the 3.2 review proved a whole-prefix deleteMany
  // here races the other workers under fullyParallel).
  await withPrisma((db) =>
    db.lead.deleteMany({
      where: {
        email: { startsWith: `${E2E_EMAIL_PREFIX}w${testInfo.workerIndex}-p${process.pid}-` },
      },
    }),
  );
});

test.describe("the Contact page — locale, form island and navigation (AC2, AC6, AC8)", () => {
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

  test("mounts the SAME RfqForm island — its controls and its anatomy, not a second form (AC2)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ RETITLED. This test used to claim the form "posts to the same endpoint"
    // and asserted nothing about an endpoint, an action or a submission — the
    // island submits through `fetch`, so there is no `action` attribute to read.
    // What it can prove structurally is ISLAND IDENTITY, and it now proves more
    // of it: a hand-rolled second form carrying the same three ids would have
    // passed the old version. The endpoint itself is proven by the submit test
    // below, which reads the row back out of Postgres.
    await page.goto("/en/contact");
    await expect(page.locator("#rfq-name")).toBeVisible();
    await expect(page.locator("#rfq-email")).toBeVisible();
    await expect(page.locator("#rfq-project-details")).toBeVisible();
    // The island's anatomy: the honeypot (aria-hidden, tabindex=-1 — FR32) and
    // the consent control. A lighter hand-written form would carry neither.
    // The wrapper carries `aria-hidden`, the input carries `tabIndex={-1}` —
    // they are different elements, and a single combined selector matches
    // nothing (measured).
    await expect(page.locator('form [aria-hidden="true"] input#rfq-website')).toHaveCount(1);
    await expect(page.locator("#rfq-website")).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("checkbox")).toBeVisible();
    // ...and exactly ONE form on the page — a second would mean a duplicate path.
    await expect(page.locator("form")).toHaveCount(1);
  });

  test("carries the phone as CHROME — the SAME TalkCard /rfq mounts, identified by its own label (AC8)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ IDENTIFIED, NOT MERELY COUNTED. The old version asserted that SOME
    // `tel:` link existed in `main`, which the site-wide header phone already
    // satisfies on every page — it could not tell TalkCard from any other phone
    // link, so deleting `<TalkCard />` from the page would have left it green.
    // TalkCard is the ONE of fifteen `tel:` sites whose accessible name is built
    // from `Rfq.talkCta` rather than `Nav.phoneLabel`; that minority convention
    // is recorded as deviation #3 in its docstring and is what identifies it
    // here. Story 3.6 owns reconciling the label — when it does, this name
    // changes in ONE component and this assertion changes with it.
    await page.goto("/en/contact");
    const talk = page.getByRole("link", { name: /^Call an engineer: /i });
    await expect(talk).toHaveCount(1);
    await expect(talk).toHaveAttribute("href", /^tel:/);
    await expect(page.getByRole("heading", { name: "Prefer to talk?" })).toBeVisible();
    // ⚠️ The number is `SITE.phone`'s placeholder and that is CORRECT here: the
    // header, the hero and every industry page already show it. AC1's
    // configured-channels rule governs the NEW channels only.
  });

  test("is reachable from the footer, which renders on every page (AC6)", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ RETITLED: the old title said "on every page" while the test visited
    // exactly one URL in one locale. The footer is one shared layout component,
    // so proving the link on one page proves the slot; the claim is now scoped
    // to what is actually asserted. The link ships even though the page is
    // noindex — a buyer can reach it, a crawler is told not to list it. Those
    // are different questions.
    await page.goto("/en");
    const footer = page.getByRole("contentinfo");
    await expect(footer.getByRole("link", { name: "Contact", exact: true })).toBeVisible();
    await footer.getByRole("link", { name: "Contact", exact: true }).click();
    // ⚠️ `waitForURL`, NOT `toHaveURL`. This is a client-side transition into a
    // route the dev server may still be compiling, and `toHaveURL`'s 15s
    // assertion window is not a navigation timeout — it polls, then fails while
    // the navigation is still legitimately in flight. `rfq.spec.ts` uses
    // `waitForURL` for the same reason.
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

test.describe("the configured-channels rule (AC1) — the page's central behaviour", () => {
  /**
   * ⚠️ THE COVERAGE GAP THE 3.8 REVIEW FOUND. Nothing at any level rendered this
   * page, so the `hasChannels` zone gate, the three per-row gates, the `mailto:`,
   * the derived maps link and the five legal rows had never executed anywhere —
   * in a test or in the running app. A parallel review agent demonstrated it by
   * replacing the zone guard with `{true && (` and watching the whole suite stay
   * green.
   *
   * Both directions are asserted from ONE computed expectation, so this holds
   * today (nothing configured) and on the day GLH delivers.
   */
  test("renders exactly the configured channels — and no bare label above nothing", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    await page.goto("/en/contact");
    const main = page.locator("main");

    // The zone heading is INSIDE the conditional region: with no channel
    // configured, "Ways to reach us" must not draw above emptiness (the
    // "border draws above nothing" defect the 3.5 review found on six surfaces).
    await expect(main.getByText("Ways to reach us")).toHaveCount(CHANNELS.length > 0 ? 1 : 0);

    // Email — a `mailto:` iff the channel is configured.
    const mailto = main.locator('a[href^="mailto:"]');
    await expect(mailto).toHaveCount(CHANNELS.includes("email") ? 1 : 0);
    if (CHANNELS.includes("email")) {
      await expect(mailto).toHaveAttribute("href", `mailto:${CONTACT.email}`);
      await expect(mailto).toHaveAttribute("translate", "no");
    }

    // Address — and its DERIVED maps link, which must be the derived URL exactly.
    await expect(main.getByText("Office")).toHaveCount(CHANNELS.includes("address") ? 1 : 0);
    const maps = main.locator('a[href^="https://www.google.com/maps"]');
    await expect(maps).toHaveCount(CHANNELS.includes("address") ? 1 : 0);
    if (CHANNELS.includes("address")) {
      await expect(maps).toHaveAttribute("href", mapsUrl(CONTACT.address!));
      // The new-tab affordance (WCAG 3.2.5) — the codebase's only `_blank`.
      await expect(maps).toHaveAttribute("target", "_blank");
      await expect(maps).toContainText("opens in a new tab");
    }

    // Legal — withheld until `approvals.legalReviewed`, however complete it is.
    await expect(main.getByText("Company details")).toHaveCount(CHANNELS.includes("legal") ? 1 : 0);
  });

  test("⛔ publishes the legal block ONLY after legal review — noindex withholds it from nobody", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // The critical review finding, asserted at the surface a buyer sees. If the
    // registered name is supplied but `approvals.legalReviewed` is false, the
    // реквизиты must not be on the page at all — `prd.md:186` (DP-10, OQ7)
    // requires qualified legal review before launch, and a `noindex` page is
    // still public and still footer-linked.
    await page.goto("/en/contact");
    const legalVisible = CONTACT.legal.legalName !== null && CONTACT.approvals.legalReviewed;
    await expect(page.locator("main").getByText("Registered name")).toHaveCount(
      legalVisible ? 1 : 0,
    );
  });

  test("never advertises a channel it does not have, in the lead OR the meta description", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ THE COPY SHIPPED UNCONDITIONALLY AND THE CONFIG DID NOT. `Contact.lead`
    // offered the reader an email and `Contact.metaDescription` promised "Phone,
    // email and postal address" on every request in all three locales, while
    // `src/config/contact.ts` supplied none of them — directly contradicting the
    // page docstring's "never advertises an address it does not have".
    for (const locale of ["en", "tr", "ru"] as const) {
      await page.goto(`/${locale}/contact`);
      const description =
        (await page.locator('head meta[name="description"]').getAttribute("content")) ?? "";
      expect(description.length, `${locale} has no meta description`).toBeGreaterThan(0);
      if (!CHANNELS.includes("email") || !CHANNELS.includes("address")) {
        // EN is asserted on its exact words; TR and RU on the shared token,
        // because their wording is machine-drafted and may be revised.
        if (locale === "en") {
          expect(description).not.toMatch(/postal address/i);
          expect(description).not.toMatch(/\bemail\b/i);
        }
        expect(description).not.toMatch(/@/);
      }
    }
  });
});

test.describe("Contact page — indexability, payload and third parties (AC3, AC5)", () => {
  test("robots and the sitemap agree, in all three locales, in whatever state the config is in", async ({
    page,
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    // ⚠️ BOTH SIDES, ASSERTED TOGETHER. The robots tag and the sitemap have
    // silently drifted THREE times in this project (1.9, the 2.1 review, the 2.4
    // review), and `seo.spec.ts`'s assertions are per-route — /contact is in none
    // of them, so without this nothing would notice a disagreement.
    //
    // ⚠️ AND DERIVED, NOT PINNED. This used to hard-code `noindex` in three
    // locales and the sitemap's exclusion, so it would have gone RED on delivery
    // day for no defect — while the story, the commit and the config docstring
    // all promised supplying the values was a no-code-change edit.
    for (const locale of ["en", "tr", "ru"] as const) {
      await page.goto(`/${locale}/contact`);
      await expect(page.locator('head meta[name="robots"]')).toHaveAttribute(
        "content",
        PUBLISHED ? /^index/ : /noindex/,
      );
    }

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    for (const locale of ["en", "tr", "ru"] as const) {
      const listed = xml.includes(`/${locale}/contact<`);
      expect(
        listed,
        PUBLISHED
          ? `/${locale}/contact is published but absent from the sitemap`
          : `/${locale}/contact must not be advertised while it is a placeholder`,
      ).toBe(PUBLISHED);
    }
  });

  test("the industries prop is NARROWED — no row id or description reaches the client payload", async ({
    request,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * §H #4, which was never written.
     *
     * ⚠️ `IndustryListItem` is `RfqIndustryOption` PLUS `id` and `description`,
     * so `industries={industries}` COMPILES — TypeScript's excess-property check
     * does not apply to a variable — and silently ships both extra fields into
     * the client payload of a `"use client"` island. The page defends with an
     * explicit `.map()`; nothing asserted that the defence works, and it is
     * invisible to typecheck, lint and every render assertion.
     *
     * ⚠️ ASSERTED ON THE SERVED HTML, NOT THE SOURCE. The leak is a property of
     * the serialized RSC payload, so reading `page.tsx` proves nothing.
     */
    const industry = await withPrisma((db) =>
      db.industry.findFirst({
        where: { translations: { some: { description: { not: null } } } },
        select: { id: true, translations: { select: { description: true }, take: 1 } },
      }),
    );

    // ⚠️ MEASURED: NO SEEDED INDUSTRY CARRIES A DESCRIPTION, so a "the
    // description did not leak" assertion would pass over an empty set and
    // report success for a check that examined nothing — the vacuous-gate
    // failure this project keeps finding. It is therefore NOT asserted, and the
    // omission is recorded here rather than hidden: `id` and `description` are
    // dropped by the SAME `.map()`, so the id half below is decisive for both.
    // If a described industry is ever seeded, assert the description too.
    const described = industry !== null;

    const ids = await withPrisma((db) => db.industry.findMany({ select: { id: true } }));
    expect(ids.length, "no industries seeded — this check would be vacuous").toBeGreaterThan(0);

    const html = await (await request.get("/en/contact")).text();
    const leaked = ids.filter((row) => html.includes(row.id)).map((row) => row.id);
    expect(leaked, "an industry row id leaked into the client payload").toEqual([]);

    testInfo.annotations.push({
      type: "coverage",
      description: described
        ? "description leak asserted via the shared .map()"
        : "description-leak half not asserted: no seeded industry has a description",
    });
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

test.describe("a submission FROM /contact reaches Postgres (AC2)", () => {
  test("KEYSTONE: submit on /contact → row persisted with source = direct", async ({
    page,
  }, testInfo) => {
    if (!dbReady) testInfo.skip();
    /**
     * §H #7, which was never written.
     *
     * AC2's claim is that /contact mounts the same island posting to the same
     * endpoint; every assertion made for it was structural, so a form that
     * rendered correctly and submitted nowhere would have passed. This is the
     * only proof that the endpoint half is true — and it also pins `source`:
     * /contact carries no doorway, so a lead from here is `direct`, and Story
     * 4.7's leads list reports origin from that column.
     */
    const email = uniqueEmail(testInfo.workerIndex);
    await page
      .context()
      .setExtraHTTPHeaders({ "x-forwarded-for": fakeClientIp(testInfo.workerIndex) });

    await page.goto("/en/contact");
    await page.waitForFunction(() => {
      const form = document.querySelector("form");
      return !!form && Object.keys(form).some((key) => key.startsWith("__reactProps"));
    });

    await page.getByLabel("Full name").fill("Elena Petrova");
    await page.getByLabel("Company").fill("Enka EPC");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Project description").fill("Contact-page inquiry, EN 54 panels.");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send project inquiry" }).click();

    const heading = page.getByRole("heading", { name: "Inquiry sent" });
    await expect(heading).toBeVisible();

    const reference = await page.getByText(/^GLH-RFQ-\d+$/).innerText();
    const row = await withPrisma((db) => db.lead.findUnique({ where: { reference } }));
    expect(row, `no lead row for on-screen reference ${reference}`).not.toBeNull();
    expect(row!.email).toBe(email);
    expect(row!.source).toBe("direct");

    // ⚠️ §H #3 — THE `sla={null}` HOLE, which the story called "the one hole the
    // type system cannot catch" and then wrote in NEITHER of the two forms it
    // specified. `RfqForm`'s `sla` prop is `SlaContent | null`, so passing
    // `null` from /contact TYPECHECKS, LINTS and renders a perfectly good page —
    // it only drops the stepper from the submitted confirmation, a surface that
    // exists solely after a successful POST and which nothing on this page
    // reached. This is the assertion that catches it, and it is only possible
    // here because this test gets to the confirmation.
    //
    // The copy is IMPORTED, never retyped: `e2e/` is inside the AC5 hygiene
    // sweep, so a literal SLA sentence here would be a second source of it.
    const steps = slaTextFor("en").steps;
    for (const step of steps) {
      await expect(
        page.getByText(step.title, { exact: true }),
        `the confirmation dropped SLA step "${step.title}" — is \`sla\` null?`,
      ).toBeVisible();
    }
  });
});
