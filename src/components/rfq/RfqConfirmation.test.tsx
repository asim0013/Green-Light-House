import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { slaTextFor, SLA_ARROW_BADGE } from "../../../scripts/sla-fixtures";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The submitted-confirmation surface (Story 3.5 — AC3, AC6, AC8).
 *
 * ⚠️ WHY THIS FILE EXISTS AT ALL. The confirmation is the EIGHTH SLA render site
 * and the only one an end-to-end test cannot reach cheaply: it mounts as client
 * state after a successful POST, and `playwright.caching.config.ts` declares no
 * `globalTeardown`, so a lead submitted to reach it would escape the pollution
 * gate the main suite relies on. AC6 sanctions proving this surface separately —
 * this is that proof, and the seven navigable surfaces are proven warm-cache in
 * `e2e/caching.spec.ts`.
 *
 * ⚠️ IT IS ALSO THE ONE §G PREDICTION THAT DID NOT COME TRUE, and the gap was
 * real. The story expected `RfqForm.test.tsx:54,427` to "gain the prop" and
 * invert; the implementation made `sla` OPTIONAL with a `null` default instead,
 * so those render tests compiled untouched and nothing anywhere asserted that
 * this surface renders the content model. A prop that defaults to null is
 * exactly the shape that goes un-passed and un-noticed.
 *
 * The fixture is built from `scripts/sla-fixtures.ts` — the module the seed
 * writes into the database — never retyped. A hand-copied fixture is a second
 * source of the copy and the AC5 hygiene gate would correctly fail on it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values ? `${key}:${Object.values(values).join(",")}` : key;
    t.rich = (key: string) => key;
    return t;
  },
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { RfqConfirmation } = await import("./RfqConfirmation");

const EN: SlaContent = { ...slaTextFor("en"), isFallback: false };
const FELL_BACK: SlaContent = { ...slaTextFor("en"), isFallback: true };

/** `renderToStaticMarkup` escapes `&`, and two of the three step descriptions
 *  contain one — comparing raw copy against the markup silently never matches. */
const html_ = (text: string) => text.replace(/&/g, "&amp;");

const render = (sla: SlaContent | null) =>
  renderToStaticMarkup(<RfqConfirmation reference="GLH-RFQ-1042" sla={sla} />);

describe("RfqConfirmation — the eighth SLA surface", () => {
  it("renders the content model's three steps, not a hard-coded promise", () => {
    // P5: pass `sla={null}` here and this reddens.
    //
    // ⚠️ WHAT THIS DOES *NOT* PROVE, stated rather than implied: it renders the
    // component DIRECTLY, so deleting `sla={sla}` at `RfqForm.tsx:508` would
    // leave it green. That threading is guarded by the TYPE instead — `sla` is a
    // required prop on both this component and `RfqForm`, so a mount that drops
    // it fails to compile. A test cannot cheaply reach this surface (it appears
    // only after a real POST); the compiler can, and does.
    const html = render(EN);
    for (const step of EN.steps) {
      expect(html).toContain(html_(step.title));
      expect(html).toContain(html_(step.description));
    }
    expect(html.match(/<li\b/g) ?? []).toHaveLength(3);
  });

  it("promises no duration on the third step — the badge is the arrow (AC3/AC7)", () => {
    // P5: put a duration on step three in `scripts/sla-fixtures.ts` and this
    // reddens. The formal quote is deliberately unpromised; the canvas says so
    // in capitals, and nothing on this surface may invent a number for it.
    const html = render(EN);
    expect(html).toContain(SLA_ARROW_BADGE);
    const thirdBadge = EN.steps[2].badge;
    expect(thirdBadge).toBe(SLA_ARROW_BADGE);
    expect(thirdBadge).not.toMatch(/\d/);
  });

  it("renders NO kicker — this surface never drew one, before or after (F #43)", () => {
    // `showKicker` defaults false and the confirmation does not pass it. If a
    // future edit turns it on, the heading order on this card changes silently.
    const html = render(EN);
    expect(html).not.toContain(html_(EN.kicker));
  });

  it("marks a fallen-back row with lang=en and a LIGHT-tone notice (FR34a, F #43)", () => {
    // The tone is not styling: this card is `bg-surface` (white), where
    // FallbackNotice's dark-ground token measures 2.96:1. P5: change
    // `tone="light"` to `tone="onDark"` in RfqConfirmation and the notice class
    // asserted here changes.
    const html = render(FELL_BACK);
    expect(html).toContain('lang="en"');
    expect(render(EN)).not.toContain('lang="en"');
  });

  it("renders the card WITHOUT a stepper when the model is empty (AC8)", () => {
    // The degenerate branch on this surface: a buyer who has just submitted must
    // still get the card and its reference line. Rendering nothing at all, or
    // throwing, would lose the one piece of information the POST produced.
    //
    // ⚠️ THE REFERENCE VALUE ITSELF CANNOT BE ASSERTED HERE, and saying so is the
    // point: it is interpolated through `t.rich`, which the next-intl mock above
    // collapses to its own key. So this pins that the reference LINE survives the
    // null model, not that the digits reach it — `e2e/rfq.spec.ts` owns that,
    // against a real translator.
    const html = render(null);
    expect(html).toContain("confirmTitle");
    expect(html).toContain("confirmReference");
    expect(html).not.toContain("<li");
    for (const step of EN.steps) {
      expect(html).not.toContain(html_(step.title));
    }
  });
});
