import { describe, it, expect } from "vitest";
import { guideSignals, guidesIndexSignals, guideListItemSignals } from "./guide-page";
import type { GuideDetail, GuideListItem } from "@/server/repositories/selection-guide";

/**
 * Guide thin-content signals (Story 4.11, FR42a). Asserts the ContentSignals
 * fields that drive `isIndexable`/`robotsFor` (which `seo.ts` owns and tests);
 * same boundary `contact-page.test.ts` uses — importing `@/lib/seo` at runtime
 * pulls `next/navigation`, which the test env can't resolve. Pure; no DB.
 *
 * Recall `thinContentReason`: `isPlaceholder` → noindex; `itemCount <= 0` →
 * noindex; and for a NON-default locale, `fallbackFields >= totalFields` (> 0) →
 * noindex (EN cannot be a fallback of itself).
 */
function guide(overrides: Partial<GuideDetail> = {}): GuideDetail {
  return {
    slug: "choosing-flame-detectors",
    title: "Choosing flame detectors",
    intro: "A practical guide.",
    metaDescription: null,
    isFallback: false,
    sections: [{ heading: "Step 1", body: "…", isFallback: false }],
    products: [],
    categories: [],
    ...overrides,
  };
}

describe("guideSignals", () => {
  it("a missing/draft guide (null) is a placeholder → noindex", () => {
    expect(guideSignals("en", null)).toMatchObject({ itemCount: 0, isPlaceholder: true });
  });

  it("a published guide with prose has itemCount > 0, no placeholder, no fallback", () => {
    const s = guideSignals("en", guide());
    expect(s.itemCount).toBeGreaterThan(0);
    expect(s.isPlaceholder).toBeUndefined();
    expect(s.fallbackFields).toBe(0);
  });

  it("a published guide with NO prose (no intro, no sections) is empty → noindex", () => {
    // P5: give it an intro or a section and itemCount rises above 0.
    expect(guideSignals("en", guide({ intro: null, sections: [] })).itemCount).toBe(0);
    // Curated links do NOT count as prose.
    expect(
      guideSignals(
        "en",
        guide({
          intro: null,
          sections: [],
          products: [{ slug: "p", name: "P", isFallback: false }],
        }),
      ).itemCount,
    ).toBe(0);
  });

  it("marks a fallen-back guide fallback-only (fallbackFields === totalFields > 0)", () => {
    const s = guideSignals("tr", guide({ isFallback: true }));
    expect(s.fallbackFields).toBe(1);
    expect(s.totalFields).toBe(1); // tr/ru → fallback-only (noindex); EN cannot be its own fallback (seo.ts)
  });
});

describe("guideListItemSignals (the sitemap's per-guide gate)", () => {
  it("matches guideSignals' formula from a list item — prose required, fallback honored", () => {
    // Prose-less (no intro, 0 sections) → empty; with a section → content.
    expect(
      guideListItemSignals("en", {
        slug: "g",
        title: "G",
        intro: null,
        sectionCount: 0,
        isFallback: false,
      }).itemCount,
    ).toBe(0);
    expect(
      guideListItemSignals("en", {
        slug: "g",
        title: "G",
        intro: "x",
        sectionCount: 2,
        isFallback: false,
      }).itemCount,
    ).toBe(3);
    expect(
      guideListItemSignals("tr", {
        slug: "g",
        title: "G",
        intro: "x",
        sectionCount: 1,
        isFallback: true,
      }).fallbackFields,
    ).toBe(1);
  });
});

describe("guidesIndexSignals", () => {
  const item = (isFallback = false): GuideListItem => ({
    slug: "g",
    title: "G",
    intro: null,
    sectionCount: 0,
    isFallback,
  });

  it("counts guides, with the fallback ratio for the non-EN fallback-only gate", () => {
    expect(guidesIndexSignals("en", []).itemCount).toBe(0); // empty → noindex
    const s = guidesIndexSignals("tr", [item(true), item(false)]);
    expect(s.itemCount).toBe(2);
    expect(s.fallbackFields).toBe(1);
    expect(s.totalFields).toBe(2);
  });
});
