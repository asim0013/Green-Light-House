import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Kicker } from "./Kicker";
import { SectionHeader } from "./SectionHeader";

/**
 * Locks the kicker tone→surface binding (Story 1.7 review).
 *
 * The accessibility argument for the whole `tone` mechanism lived only in a
 * docstring: nothing failed if either default flipped. Since the two defaults are
 * deliberately OPPOSITE — `Kicker` defaults to the dark-band tone, `SectionHeader`
 * to the light-surface tone — that asymmetry is exactly the kind of thing a later
 * "tidy-up" silently reverses, taking a live surface below AA with it.
 *
 * Ratios (DESIGN.md hexes, rounded down):
 *   accent-soft #5C86B5 → 3.79 on white ❌ · 4.68 on ink ✅
 *   ink-2       #5A6470 → 6.01 on white ✅ · 2.95 on ink ❌
 */

describe("Kicker tone binding", () => {
  it("defaults to the DARK-BAND tone (accent-soft)", () => {
    // Kicker's bare default is consumed inside DarkBand (HomeCredibility, SiteFooter).
    expect(renderToStaticMarkup(<Kicker>label</Kicker>)).toContain("text-accent-soft");
  });

  it("renders the light-surface tone as ink-2, never accent-soft", () => {
    const html = renderToStaticMarkup(<Kicker tone="ink">label</Kicker>);
    expect(html).toContain("text-ink-2");
    expect(html).not.toContain("text-accent-soft");
  });

  it("keeps muted available but distinct", () => {
    expect(renderToStaticMarkup(<Kicker tone="muted">label</Kicker>)).toContain("text-muted");
  });
});

describe("SectionHeader kicker tone", () => {
  it("defaults to the LIGHT-surface tone (ink-2) — section headers sit on surface", () => {
    const html = renderToStaticMarkup(<SectionHeader kicker="EQUIPMENT" title="What we supply" />);
    expect(html).toContain("text-ink-2");
    expect(html).not.toContain("text-accent-soft");
  });

  it("can opt into the dark-band tone", () => {
    const html = renderToStaticMarkup(
      <SectionHeader kicker="CAPABILITY" title="On a dark band" kickerTone="accent" />,
    );
    expect(html).toContain("text-accent-soft");
  });

  it("renders the title as an h2 so the page keeps a single h1", () => {
    const html = renderToStaticMarkup(<SectionHeader title="Built for your sector" />);
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h1");
  });
});
