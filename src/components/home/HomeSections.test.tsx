import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { IndustryListItem } from "@/server/repositories/industry";
import type { CategoryListItem } from "@/server/repositories/category";
import type { ManufacturerListItem } from "@/server/repositories/manufacturer";

/**
 * Discovery + credibility sections (Story 1.7, AC3/AC4/AC5/AC6/AC7).
 *
 * The load-bearing assertions here are the two DESIGN/FR guards that a reviewer
 * would otherwise have to catch by eye:
 *   - **display-only** — Q1 resolved these sections to render NO anchors, because
 *     FR8's AC forbids a logo resolving to a dead page and every target route is
 *     unbuilt until Epic 2. An `<a>` appearing here is a regression.
 *   - **never navy on dark** — the credibility band must not emit `bg-accent`.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const props = { ...rest };
    delete props.locale;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const { HomeIndustries } = await import("./HomeIndustries");
const { HomeCategories } = await import("./HomeCategories");
const { HomeManufacturers } = await import("./HomeManufacturers");
const { HomeCredibility } = await import("./HomeCredibility");

const INDUSTRIES: IndustryListItem[] = [
  { id: "i1", slug: "oil-gas", name: "Oil & Gas", description: null, isFallback: false },
  { id: "i2", slug: "energy", name: "Energy", description: null, isFallback: true },
];

// One translated row and one fallen-back row in EVERY fixture, so both the
// "marks a fallback" and "does not over-mark" directions are representable.
// (Review finding: an all-`isFallback: false` fixture made the category marking
// undeletable-by-test — removing the marking left the suite green.)
const CATEGORIES: CategoryListItem[] = [
  { id: "c1", slug: "fire-gas-detection", name: "Fire & gas detection", isFallback: false },
  { id: "c2", slug: "ppe", name: "Personal protective equipment", isFallback: true },
];

const MANUFACTURERS: ManufacturerListItem[] = [
  { id: "m1", slug: "sentra-fire", name: "Sentra Fire Systems", logoUrl: null, isFallback: false },
  { id: "m2", slug: "gastec", name: "Gastec", logoUrl: null, isFallback: true },
];

/** Count of elements matching `tag` that do NOT carry `attr`. */
function missingAttr(html: string, tag: string, attr: string): number {
  return (html.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? []).filter((t) => !t.includes(attr))
    .length;
}

describe("HomeIndustries", () => {
  it("renders every industry name", () => {
    const html = renderToStaticMarkup(<HomeIndustries industries={INDUSTRIES} />);
    expect(html).toContain("Oil &amp; Gas");
    expect(html).toContain("Energy");
  });

  it("links each industry to its landing page (wired by Story 2.1)", () => {
    // Story 1.7 asserted the opposite — no anchors at all — because
    // `/industries/<slug>` did not exist yet and FR8 forbids an entry point that
    // resolves to a dead page. That route is built now, so the assertion inverts:
    // one anchor per industry, each pointing at its own slug.
    const html = renderToStaticMarkup(<HomeIndustries industries={INDUSTRIES} />);
    expect((html.match(/<a /g) ?? []).length).toBe(INDUSTRIES.length);
    expect(html).toContain('href="/industries/oil-gas"');
    expect(html).toContain('href="/industries/energy"');
  });

  it("marks the fallen-back name and does NOT mark the translated one", () => {
    const html = renderToStaticMarkup(<HomeIndustries industries={INDUSTRIES} />);
    // Exactly one of the two fixture rows fell back — a bare `toContain` would
    // also pass if every row were marked, which is the opposite bug.
    expect((html.match(/lang="en"/g) ?? []).length).toBe(1);
    expect((html.match(/shownInEnglish/g) ?? []).length).toBe(1);
  });

  it("renders the defined empty state with no rows", () => {
    const html = renderToStaticMarkup(<HomeIndustries industries={[]} />);
    expect(html).toContain("industriesEmpty");
  });
});

describe("HomeCategories", () => {
  it("renders every category name", () => {
    const html = renderToStaticMarkup(<HomeCategories categories={CATEGORIES} />);
    expect(html).toContain("Fire &amp; gas detection");
    expect(html).toContain("Personal protective equipment");
  });

  it("links each category to its catalog view (wired by Story 2.2)", () => {
    // Story 1.7 asserted the opposite — no anchors — because the catalog did not
    // exist and FR8 forbids an entry point that resolves to a dead page. /products
    // exists now, so the assertion inverts, exactly as HomeIndustries did in 2.1:
    // one anchor per category, each carrying the filter-view URL shape.
    const html = renderToStaticMarkup(<HomeCategories categories={CATEGORIES} />);
    expect((html.match(/<a /g) ?? []).length).toBe(CATEGORIES.length);
    expect(html).toContain(String.raw`href="/products?category=fire-gas-detection"`);
    expect(html).toContain(String.raw`href="/products?category=ppe"`);
  });

  it("hides EVERY decorative thumbnail icon from assistive tech", () => {
    // Asserting `toContain("aria-hidden")` would be tautological — lucide-react
    // adds it by default. This fails if any icon gains an a11y prop (which makes
    // lucide DROP aria-hidden) or if a future thumbnail is not hidden.
    const html = renderToStaticMarkup(<HomeCategories categories={CATEGORIES} />);
    expect(html).toContain("<svg");
    expect(missingAttr(html, "svg", 'aria-hidden="true"')).toBe(0);
  });

  it("marks a fallen-back category and leaves a translated one unmarked", () => {
    const html = renderToStaticMarkup(<HomeCategories categories={CATEGORIES} />);
    // Exactly one of the two fixture rows fell back.
    expect((html.match(/lang="en"/g) ?? []).length).toBe(1);
    expect((html.match(/shownInEnglish/g) ?? []).length).toBe(1);
  });

  it("renders the defined empty state with no rows", () => {
    const html = renderToStaticMarkup(<HomeCategories categories={[]} />);
    expect(html).toContain("categoriesEmpty");
  });
});

describe("HomeManufacturers", () => {
  it("renders each manufacturer as a wordmark", () => {
    const html = renderToStaticMarkup(<HomeManufacturers manufacturers={MANUFACTURERS} />);
    expect(html).toContain("Sentra Fire Systems");
    expect(html).toContain("Gastec");
  });

  it("emits no anchors — FR8 forbids a logo resolving to a dead page", () => {
    const html = renderToStaticMarkup(<HomeManufacturers manufacturers={MANUFACTURERS} />);
    expect(html).not.toContain("<a ");
  });

  it("emits no <img> when every logoUrl is null", () => {
    // Every seeded row has logoUrl = null; an <img src=""> would refetch the page.
    const html = renderToStaticMarkup(<HomeManufacturers manufacturers={MANUFACTURERS} />);
    expect(html).not.toContain("<img");
  });

  it("does not hand a REMOTE logo url to next/image", () => {
    // An unconfigured host throws at render and 500s the whole homepage; remote
    // hosts arrive with the media library (Story 4.5), which owns remotePatterns.
    const html = renderToStaticMarkup(
      <HomeManufacturers
        manufacturers={[{ ...MANUFACTURERS[0], logoUrl: "https://cdn.example.com/a.png" }]}
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("Sentra Fire Systems");
  });

  it("marks a fallen-back OEM name and leaves a translated one unmarked (AC6)", () => {
    const html = renderToStaticMarkup(<HomeManufacturers manufacturers={MANUFACTURERS} />);
    expect((html.match(/lang="en"/g) ?? []).length).toBe(1);
    expect((html.match(/shownInEnglish/g) ?? []).length).toBe(1);
  });

  it("renders the defined empty state with no rows", () => {
    const html = renderToStaticMarkup(<HomeManufacturers manufacturers={[]} />);
    expect(html).toContain("manufacturersEmpty");
  });
});

describe("HomeCredibility", () => {
  it("renders the capability statement and cert marks", () => {
    const html = renderToStaticMarkup(<HomeCredibility />);
    expect(html).toContain("capability");
    expect(html).toContain("ISO 9001");
  });

  it("never places a navy button on the ink band (DESIGN hard rule)", () => {
    const html = renderToStaticMarkup(<HomeCredibility />);
    expect(html).not.toContain("bg-accent");
  });

  it("uses the on-dark button variants for both closing CTAs", () => {
    const html = renderToStaticMarkup(<HomeCredibility />);
    // `focus-visible:ring-offset-ink` comes ONLY from buttonClasses' RING_DARK, so
    // this cannot be satisfied by some other element that happens to share a fill.
    // (A bare `bg-surface` check passed even with the on-dark variants removed.)
    expect((html.match(/focus-visible:ring-offset-ink/g) ?? []).length).toBe(2);
    expect(html).toContain("bg-surface text-ink"); // onDarkPrimary
    expect(html).toContain("border-white"); // onDarkSecondary
  });

  it("gives the cert chips an on-dark treatment, not a light fill", () => {
    // `filled`/`outline` both ship a light surface, which on the ink band renders
    // as a solid white block — visually a primary button, not a chip.
    const html = renderToStaticMarkup(<HomeCredibility />);
    expect(html).toContain("border-on-dark-border");
    expect(html).toContain("text-on-dark-text");
    // The light-chip signatures: `filled` is bg-surface-2+text-ink-2, `outline`
    // adds border-border-subtle. Neither may appear on the ink band. (Not asserting
    // on `bg-surface-2` alone — onDarkPrimary legitimately uses it as a hover.)
    expect(html).not.toContain("border-border-subtle");
    expect(html).not.toContain("text-ink-2");
  });

  it("carries the conversion pair: RFQ link and tel: action", () => {
    const html = renderToStaticMarkup(<HomeCredibility />);
    expect(html).toContain('href="/rfq"');
    expect(html).toContain('href="tel:');
  });

  it("sits on the ink band", () => {
    const html = renderToStaticMarkup(<HomeCredibility />);
    expect(html).toContain("bg-ink");
  });

  // Story 4.4b: the editable model wins over messages when present; absent → the
  // messages fallback (here the mock returns the key). P5: drop the `content?.x ??`
  // in the component and the model values stop appearing.
  it("prefers HomeContent model values over messages, and cert marks over CERTS", () => {
    const content = {
      kicker: null,
      title: null,
      lead: null,
      noPrices: null,
      credibilityTitle: "MODEL CRED TITLE",
      capability: "MODEL CAPABILITY",
      ctaTitle: "MODEL CTA",
      industriesTitle: null,
      industriesSub: null,
      categoriesTitle: null,
      manufacturersTitle: null,
      certMarks: ["ZZZ-CERT-MARK"],
      isFallback: false,
    };
    const html = renderToStaticMarkup(<HomeCredibility content={content} />);
    expect(html).toContain("MODEL CRED TITLE");
    expect(html).toContain("MODEL CAPABILITY");
    expect(html).toContain("ZZZ-CERT-MARK");
    // The message KEYS (what the mock renders as fallback) must NOT appear.
    expect(html).not.toContain("credibilityTitle");
    expect(html).not.toContain("ISO 9001");
  });

  it("falls back to messages when content is null", () => {
    const html = renderToStaticMarkup(<HomeCredibility content={null} />);
    expect(html).toContain("credibilityTitle"); // the mock's key-as-value fallback
    expect(html).toContain("ISO 9001"); // the CERTS fallback
  });
});
