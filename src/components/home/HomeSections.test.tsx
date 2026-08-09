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

const CATEGORIES: CategoryListItem[] = [
  { id: "c1", slug: "fire-gas-detection", name: "Fire & gas detection", isFallback: false },
  { id: "c2", slug: "ppe", name: "Personal protective equipment", isFallback: false },
];

const MANUFACTURERS: ManufacturerListItem[] = [
  { id: "m1", slug: "sentra-fire", name: "Sentra Fire Systems", logoUrl: null, isFallback: false },
  { id: "m2", slug: "gastec", name: "Gastec", logoUrl: null, isFallback: false },
];

describe("HomeIndustries", () => {
  it("renders every industry name", () => {
    const html = renderToStaticMarkup(<HomeIndustries industries={INDUSTRIES} />);
    expect(html).toContain("Oil &amp; Gas");
    expect(html).toContain("Energy");
  });

  it("emits no anchors — display-only in v1 (Q1)", () => {
    const html = renderToStaticMarkup(<HomeIndustries industries={INDUSTRIES} />);
    expect(html).not.toContain("<a ");
  });

  it("marks a fallen-back name with lang=en and the notice", () => {
    const html = renderToStaticMarkup(<HomeIndustries industries={INDUSTRIES} />);
    expect(html).toContain('lang="en"');
    expect(html).toContain("shownInEnglish");
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

  it("emits no anchors — display-only in v1 (Q1)", () => {
    const html = renderToStaticMarkup(<HomeCategories categories={CATEGORIES} />);
    expect(html).not.toContain("<a ");
  });

  it("hides its decorative thumbnail icons from assistive tech", () => {
    const html = renderToStaticMarkup(<HomeCategories categories={CATEGORIES} />);
    expect(html).toContain("aria-hidden");
    expect(html).toContain("<svg");
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
    expect(html).toContain("bg-surface"); // onDarkPrimary = white fill + ink label
    expect(html).toContain("border-white"); // onDarkSecondary = white hairline
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
});
