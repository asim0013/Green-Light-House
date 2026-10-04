import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { slaTextFor, SLA_ARROW_BADGE } from "../../../scripts/sla-fixtures";
import { trackEvent, EVENT_RFQ } from "@/lib/analytics/track";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The submitted-confirmation surface (Story 3.5 — AC3, AC6, AC8).
 *
 * ⚠️ WHY THIS FILE EXISTS AT ALL. The confirmation is the EIGHTH SLA render site
 * and the only one an end-to-end test cannot reach cheaply: it mounts as client
 * state after a successful POST, and `playwright.caching.config.ts` declares no
 * `globalTeardown`, so a lead submitted to reach it would escape the pollution
 * gate the main suite relies on. AC6 sanctions proving this surface separately —
 * this is that proof, and the eight navigable surfaces are proven warm-cache in
 * `e2e/caching.spec.ts`.
 *
 * ⚠️ IT IS ALSO THE ONE §G PREDICTION THAT DID NOT COME TRUE, and the gap was
 * real. The story expected `RfqForm.test.tsx:54,427` to "gain the prop" and
 * invert. They did not, because `sla` had first been written OPTIONAL with a
 * `null` default: those render tests compiled untouched and nothing anywhere
 * asserted that this surface renders the content model. A prop that defaults to
 * null is exactly the shape that goes un-passed and un-noticed. `sla` is
 * REQUIRED now and those two helpers do pass it — so the prediction holds in the
 * shipped code, and this paragraph records why it needed a second pass.
 *
 * ⚠️ REQUIRED CATCHES OMISSION, NOT AN EXPLICIT NULL. `sla={null}` at a real
 * threading site still typechecks and still renders a card with no stepper. The
 * compiler closes the "forgot to pass it" class; nothing closes "passed the
 * wrong thing", which is why the render assertions below exist.
 *
 * The fixture is built from `scripts/sla-fixtures.ts` — the module the seed
 * writes into the database — never retyped. A hand-copied fixture is a second
 * source of the copy and the AC5 hygiene gate would correctly fail on it.
 */

vi.mock("next-intl", () => ({
  useLocale: () => "en",
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

// Story 5.8: the RFQ conversion fire. Mocked so the markup tests stay unaffected
// (effects don't run under renderToStaticMarkup) and the interaction test can assert it.
vi.mock("@/lib/analytics/track", () => ({ trackEvent: vi.fn(), EVENT_RFQ: "RFQ" }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { RfqConfirmation } = await import("./RfqConfirmation");

const EN: SlaContent = { ...slaTextFor("en"), isFallback: false };

/** The PROCESS text fell back but every step resolved in the requested locale. */
const PROCESS_FELL_BACK: SlaContent = { ...slaTextFor("en"), isFallback: true };

/**
 * The mixed state the old code could not express: the process text is in the
 * requested locale and exactly ONE step (index 1) fell back to EN. Reachable
 * whenever an editor translates the summary but not every step — and
 * `sla.test.ts` asserts the mapper supports it.
 */
const ONE_STEP_FELL_BACK: SlaContent = {
  ...slaTextFor("en"),
  isFallback: false,
  steps: slaTextFor("en").steps.map((step, i) => ({ ...step, isFallback: i === 1 })),
};

/** `renderToStaticMarkup` escapes `&`, and two of the three step descriptions
 *  contain one — comparing raw copy against the markup silently never matches. */
const html_ = (text: string) => text.replace(/&/g, "&amp;");

const render = (sla: SlaContent | null) =>
  renderToStaticMarkup(<RfqConfirmation reference="GLH-RFQ-1042" sla={sla} />);

describe("RfqConfirmation — the eighth SLA surface", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the content model's three steps, not a hard-coded promise", () => {
    // P5: pass `sla={null}` here and this reddens.
    //
    // ⚠️ WHAT THIS DOES *NOT* PROVE, stated rather than implied: it renders the
    // component DIRECTLY, so deleting the `sla` prop where `RfqForm` mounts it would
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

  it("renders the FR34a notice at the LIGHT tone when the process text fell back", () => {
    // ⚠️ THIS TEST USED TO ASSERT THE BUG. It was written as "marks a fallen-back
    // row with lang=en and a LIGHT-tone notice" and then asserted ONLY
    // `lang="en"` — no notice, no tone class — so the P5 its own comment stated
    // (flip `tone="light"` to `tone="onDark"`) could not redden it. Worse, the
    // `lang="en"` it did assert came from the OLD defect: step copy was marked
    // using the PROCESS-level flag, so English-only steps and Turkish steps were
    // both stamped wrong. Both halves are fixed; this now asserts the real
    // contract.
    //
    // A fallen-back PROCESS with in-locale STEPS means: the visible notice
    // appears (something here is English), but no step copy is marked.
    const html = render(PROCESS_FELL_BACK);
    expect(html).toContain("shownInEnglish");
    expect(html).not.toContain('lang="en"');

    // TONE. The card is `bg-surface` (white); FallbackNotice's dark-ground token
    // measures 2.96:1 on it. P5, and this one is real: change `tone="light"` to
    // `tone="onDark"` in RfqConfirmation.tsx and this reddens on both lines.
    expect(html).toContain("text-ink-2");
    expect(html).not.toContain("text-on-dark-text");
  });

  it("marks the INDIVIDUAL step that fell back, not every step (FR34a)", () => {
    // The defect this closes: steps resolve independently of the process text
    // and of each other, so a Turkish process can carry one English step. The
    // component used to mark step copy from `sla.isFallback`, which meant that
    // English step rendered UNMARKED on a Turkish page — and, in the mirror
    // case, genuinely Turkish steps were stamped `lang="en"`.
    //
    // P5: change `step.isFallback` back to `sla.isFallback` in SlaStepper and
    // this reddens — the marked-count goes to 0 here.
    const html = render(ONE_STEP_FELL_BACK);
    expect(html).toContain("shownInEnglish");
    // Exactly the one step is marked: title + description = two spans.
    expect(html.match(/lang="en"/g) ?? []).toHaveLength(2);
    expect(html).toContain(`<span lang="en">${html_(EN.steps[1].title)}</span>`);
    expect(html).not.toContain(`<span lang="en">${html_(EN.steps[0].title)}</span>`);
  });

  it("renders NO stepper for a summary-only row — a valid row with zero steps", () => {
    // The model resolves summary-only by design: a step whose text is missing in
    // both the requested locale and EN is DROPPED, and a process with no steps
    // still resolves so the seven one-liner surfaces keep their sentence. On this
    // surface that same row used to paint an empty container.
    // P5: change the guard back to `sla &&` and this reddens.
    const html = render({ ...EN, steps: [] });
    expect(html).toContain("confirmTitle");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("mt-6");
  });

  it("shows NO notice and no marker when nothing fell back", () => {
    const html = render(EN);
    expect(html).not.toContain('lang="en"');
    expect(html).not.toContain("shownInEnglish");
  });

  it("fires exactly one RFQ conversion event on mount — path+locale, no reference (Story 5.8)", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    try {
      act(() => root.render(<RfqConfirmation reference="GLH-RFQ-1042" sla={EN} />));
      expect(trackEvent).toHaveBeenCalledTimes(1);
      const [name, props] = (trackEvent as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(name).toBe(EVENT_RFQ);
      expect(props).toHaveProperty("locale", "en");
      expect(props).toHaveProperty("path");
      // P5: the reference must NEVER be in the payload (no PII).
      expect(JSON.stringify(props)).not.toContain("GLH-RFQ-1042");
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("fires ONCE under React.StrictMode's double effect invocation (5.8 review F9)", () => {
    // P5: delete the `firedRef` guard and this reddens (2 calls).
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    try {
      act(() =>
        root.render(
          <StrictMode>
            <RfqConfirmation reference="GLH-RFQ-1042" sla={EN} />
          </StrictMode>,
        ),
      );
      expect(trackEvent).toHaveBeenCalledTimes(1);
    } finally {
      act(() => root.unmount());
      container.remove();
    }
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
