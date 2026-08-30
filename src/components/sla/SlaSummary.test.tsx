import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { slaTextFor } from "../../../scripts/sla-fixtures";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The one-line SLA trust sentence (Story 3.5 — AC4, FR30/FR34a).
 *
 * ⚠️ THIS COMPONENT RENDERS ON SIX OF THE EIGHT SLA SURFACES — the home hero,
 * both industry surfaces, the product anchor card, the services band and the
 * project CTA — which makes it the widest-reach component in the story, and it
 * had NO test file at all. §H #7 asks for the fallback marker to be proven on
 * BOTH components; only `SlaStepper` had it.
 *
 * ⚠️ THE "NO HEADING" ASSERTION IS NOT COSMETIC. `e2e/home.spec.ts:56` and `:231`
 * both take `main.getByRole("heading", { level: 2 }).first()` and expect the
 * ProofCard. If this component ever introduces a heading, those two invert — on
 * a surface whose whole point is that it is visually unchanged apart from the
 * FR34a marker (§F #42).
 *
 * The fixture is built from `scripts/sla-fixtures.ts`, the module the seed writes
 * into the database. Never retyped: a hand-copied fixture is a second source of
 * the copy and the AC5 hygiene gate would correctly fail on it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { SlaSummary } = await import("./SlaSummary");

const EN: SlaContent = { ...slaTextFor("en"), isFallback: false };
const FELL_BACK: SlaContent = { ...slaTextFor("en"), isFallback: true };

/** `renderToStaticMarkup` escapes `&`; the summary does not contain one today,
 *  but the copy is editable content and the escape is invisible when it bites. */
const html_ = (text: string) => text.replace(/&/g, "&amp;");

describe("SlaSummary — the sentence six surfaces draw", () => {
  it("renders the model's summary, not a composed one", () => {
    // The summary is STORED rather than composed from the step data, because it
    // is not derivable from it — the EN steps say "Spec + proposal" where the
    // sentence says "specced proposal", and TR inverts the order entirely.
    // P5: return `sla.steps.map(s => s.title).join()` instead and this reddens.
    const html = renderToStaticMarkup(<SlaSummary sla={EN} tone="light" />);
    expect(html).toContain(html_(EN.summary));
  });

  it("introduces NO heading and NO wrapper — each caller keeps its own <p> (AC4)", () => {
    // P5: wrap the output in an <h2>, or in any element at all, and this reddens.
    // Both halves matter: a heading breaks the two homepage e2e assertions above,
    // and a wrapper breaks "visually unchanged" on six surfaces that each own
    // their typography (the product aside is the only non-uppercase variant).
    const html = renderToStaticMarkup(<SlaSummary sla={EN} tone="light" />);
    expect(html).not.toMatch(/<h[1-6]\b/);
    expect(html).not.toMatch(/^<(div|p|section|aside)\b/);
    // With no fallback there is no marker either, so the output is the bare
    // sentence — the strongest available statement of "renders no wrapper".
    expect(html).toBe(html_(EN.summary));
  });

  it("marks fallen-back copy with lang=en and the notice (FR34a)", () => {
    // P5: drop the `isFallback ? <span lang="en"> : …` branch and this reddens —
    // the exact defect the 3.4 review found in `PrefillBanner`, where a Turkish
    // buyer's screen reader read English names with Turkish phonemes.
    const html = renderToStaticMarkup(<SlaSummary sla={FELL_BACK} tone="light" />);
    expect(html).toContain('lang="en"');
    expect(html).toContain("shownInEnglish");
  });

  it("does NOT mark copy that is in the requested locale", () => {
    const html = renderToStaticMarkup(<SlaSummary sla={EN} tone="light" />);
    expect(html).not.toContain('lang="en"');
    expect(html).not.toContain("shownInEnglish");
  });

  it("passes the tone through to the marker — four of the six surfaces are dark", () => {
    // ⚠️ AN AA REQUIREMENT, NOT STYLING. `FallbackNotice`'s default light token
    // measures 2.96:1 on the ink band, on the one string the "fallback is honest"
    // promise rests on. P5: hard-code either branch and one of these reddens.
    const dark = renderToStaticMarkup(<SlaSummary sla={FELL_BACK} tone="onDark" />);
    const light = renderToStaticMarkup(<SlaSummary sla={FELL_BACK} tone="light" />);
    expect(dark).toContain("text-on-dark-text");
    expect(dark).not.toContain("text-ink-2");
    expect(light).toContain("text-ink-2");
    expect(light).not.toContain("text-on-dark-text");
  });
});
