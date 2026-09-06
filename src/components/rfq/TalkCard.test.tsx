import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SITE } from "@/config/site";
import { buttonClasses } from "@/components/ui/buttonClasses";

/**
 * The shared talk card (Story 3.8 — AC8, §H #11).
 *
 * ⚠️ THE POINT OF THIS FILE IS THE REGRESSION GUARD, NOT THE COVERAGE. AC8 says
 * the card is extracted "with no behavioural and no copy change", and an
 * intention is not a fact until something can contradict it. `RfqRail`'s own e2e
 * would not notice a class change or a lost `aria-label`; this does.
 *
 * The BASELINE below is the markup `RfqRail` produced at HEAD `2fd608c`, before
 * the extraction. If the extraction altered anything a buyer or a screen reader
 * can perceive, the first test fails and names the difference.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { TalkCard } = await import("./TalkCard");

/**
 * The structure `RfqRail.tsx:46-62` produced at `2fd608c`, before the extraction.
 *
 * ⚠️ THE BUTTON'S CLASS LIST IS COMPOSED FROM `buttonClasses`, NOT SPELLED OUT,
 * and the first draft of this test got that wrong — I wrote the expansion from
 * memory and it did not match, which read as an extraction defect when the
 * extraction was in fact byte-clean. Composing it has a second, better property:
 * this test pins what the EXTRACTION could break (structure, labels, the props
 * passed to the design system) and stays green when `buttonClasses` is
 * legitimately restyled, which is not this component's business.
 *
 * The `<svg>` is likewise elided — it is lucide's output, not ours.
 */
const BUTTON_CLASS = buttonClasses("secondary", "mt-4 w-full gap-2");

const OPENS_AT_2fd608c =
  '<div class="border border-border-subtle bg-surface p-5">' +
  '<h2 class="font-heading text-[17px] font-bold tracking-tight text-ink">talkTitle</h2>' +
  '<p class="mt-2 text-[13px] text-ink-2">talkHours</p>' +
  `<a href="tel:${SITE.phone}" aria-label="talkCta: ${SITE.phoneDisplay}" class="${BUTTON_CLASS}">`;

const CLOSES_AT_2fd608c =
  "talkCta</a>" +
  `<p class="mt-2 text-center font-data text-[13px] text-ink-2" translate="no">${SITE.phoneDisplay}</p>` +
  "</div>";

describe("TalkCard — the extraction changed nothing", () => {
  it("renders markup IDENTICAL to what RfqRail produced before the extraction", () => {
    // P5: change any class, the label, or the aria-label in `TalkCard` and this
    // reddens with a diff naming exactly what moved.
    const html = renderToStaticMarkup(<TalkCard />);
    expect(html.startsWith(OPENS_AT_2fd608c), "the card opening changed").toBe(true);
    expect(html.endsWith(CLOSES_AT_2fd608c), "the card closing changed").toBe(true);
    // The only thing between them is lucide s <svg>, which this story did not touch.
    const between = html.slice(OPENS_AT_2fd608c.length, -CLOSES_AT_2fd608c.length);
    expect(between.startsWith("<svg")).toBe(true);
    expect(between.endsWith("</svg>")).toBe(true);
    expect(between).toContain('aria-hidden="true"');
  });

  it("keeps the accessible name as LABEL + NUMBER (2.5.3)", () => {
    // The visible label alone would fail "label in name" for a voice user, who
    // says what they see. Asserted separately from the byte-comparison so a
    // future intentional restyle cannot quietly drop it while someone updates
    // the baseline string above.
    const html = renderToStaticMarkup(<TalkCard />);
    expect(html).toContain(`aria-label="talkCta: ${SITE.phoneDisplay}"`);
  });

  it("renders the phone as CHROME — the placeholder included (AC1's exemption)", () => {
    // ⚠️ NOT AN OVERSIGHT, AND THE TEST SAYS SO. /contact's configured-channels
    // rule governs the NEW channels; the phone is chrome and shows exactly what
    // the header, the hero, every industry page and the 404 already show.
    // Guarding it here would make /contact the only surface hiding it, which is
    // the inconsistency rather than the fix.
    const html = renderToStaticMarkup(<TalkCard />);
    expect(html).toContain(`tel:${SITE.phone}`);
    expect(html).toContain(SITE.phoneDisplay);
  });

  it("marks the number `translate=no` — it is machine data, not prose", () => {
    expect(renderToStaticMarkup(<TalkCard />)).toContain('translate="no"');
  });
});
