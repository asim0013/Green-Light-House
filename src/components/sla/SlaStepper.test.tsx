import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { slaTextFor, SLA_ARROW_BADGE } from "../../../scripts/sla-fixtures";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The three-step process card (Story 3.5 — AC3, UX-DR14).
 *
 * Runs with no server and no DB. The fixture is built from
 * `scripts/sla-fixtures.ts`, the same module the seed writes into the database —
 * never retyped, because a hand-copied fixture is a second source of the copy
 * and the AC5 hygiene gate would (correctly) fail on it.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// The `@/components/ui` barrel reaches `@/i18n/navigation`, which calls
// next-intl's `createNavigation` and imports `next/navigation` — unresolvable
// under vitest. Mocked exactly as the sibling component tests do.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { SlaStepper } = await import("./SlaStepper");

const EN: SlaContent = { ...slaTextFor("en"), isFallback: false };
const TR_FALLBACK: SlaContent = { ...slaTextFor("en"), isFallback: true };

/** `renderToStaticMarkup` escapes `&`, and two of the three step descriptions
 *  contain one — comparing raw copy against the markup silently never matches. */
const html_ = (text: string) => text.replace(/&/g, "&amp;");

describe("SlaStepper — the three steps", () => {
  it("renders all three steps, in order, with badge, title and description", () => {
    const html = renderToStaticMarkup(<SlaStepper sla={EN} tone="onDark" />);
    for (const step of EN.steps) {
      expect(html).toContain(html_(step.title));
      expect(html).toContain(html_(step.description));
    }
    // ORDER, not just presence: the process is a sequence, and a stepper that
    // renders "Formal quote" first promises something different.
    const positions = EN.steps.map((s) => html.indexOf(html_(s.title)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.match(/<li\b/g) ?? []).toHaveLength(3);
  });

  it("renders the third badge as the ARROW and promises no duration", () => {
    // ⚠️ THE COMMITMENT BOUNDARY. Steps one and two carry durations; the step
    // that follows them is deliberately UNPROMISED, and the canvas says so in
    // capitals ("do not invent a number"). A duration appearing on step three
    // would publish a commercial commitment nobody agreed to. The numbers
    // themselves are NOT restated here — they are content, they live in the
    // model, and the render-layer gate in `sla-hygiene.test.ts` forbids exactly
    // this kind of restatement.
    //
    // P5: seed a duration into step three's badge in `scripts/sla-fixtures.ts`
    // and this reddens.
    const html = renderToStaticMarkup(<SlaStepper sla={EN} tone="onDark" />);
    expect(EN.steps[2].badge).toBe(SLA_ARROW_BADGE);
    expect(html).toContain(SLA_ARROW_BADGE);
    // No digit may appear anywhere in the third step's badge.
    expect(/\d/.test(EN.steps[2].badge)).toBe(false);
  });

  it("marks fallen-back copy with lang=en and the notice (FR34a)", () => {
    // P5: drop the `isFallback ? <span lang="en"> : …` wrapping and this
    // reddens — the exact defect the 3.4 review found in `PrefillBanner`, where
    // a Turkish buyer's screen reader read English names with Turkish phonemes.
    const html = renderToStaticMarkup(<SlaStepper sla={TR_FALLBACK} tone="onDark" showKicker />);
    expect(html).toContain('lang="en"');
    expect(html).toContain("shownInEnglish");
  });

  it("does NOT mark copy that is in the requested locale", () => {
    const html = renderToStaticMarkup(<SlaStepper sla={EN} tone="onDark" showKicker />);
    expect(html).not.toContain('lang="en"');
    expect(html).not.toContain("shownInEnglish");
  });
});

describe("SlaStepper — tone and kicker", () => {
  it("uses the DARK-band tokens on ink and the LIGHT tokens on white", () => {
    // ⚠️ TONE IS AN AA REQUIREMENT, NOT STYLING. `Kicker`'s default `accent`
    // measures 4.68:1 on ink but 3.79:1 on white; `FallbackNotice`'s default
    // light token measures 2.96:1 on ink. One component, two grounds, so the
    // tone must travel with it.
    //
    // ⚠️ ALL FOUR TONE-DRIVEN BRANCHES ARE PINNED, not two. The earlier version
    // asserted only the kicker and the title, which left the BADGE border, the
    // DESCRIPTION colour and the FallbackNotice tone free to be hard-coded with
    // the suite green — three of the five places tone actually reaches, on a
    // component whose whole reason for taking a `tone` prop is contrast.
    //
    // P5: hard-code any single branch in SlaStepper and exactly one line here
    // reddens. Each pairs a positive with the negative of the opposite ground,
    // so a branch collapsed to one constant fails on the other render.
    const dark = renderToStaticMarkup(<SlaStepper sla={TR_FALLBACK} tone="onDark" showKicker />);
    const light = renderToStaticMarkup(<SlaStepper sla={TR_FALLBACK} tone="light" showKicker />);

    // 1. the kicker
    expect(dark).toContain("text-accent-soft");
    expect(light).not.toContain("text-accent-soft");
    // 2. the step title
    expect(dark).toContain("text-white");
    expect(light).not.toContain("text-white");
    // 3. the badge frame
    expect(dark).toContain("border-accent-soft");
    expect(light).toContain("border-muted");
    // 4. the step description
    expect(dark).toContain("text-on-dark-text");
    // 5. the FallbackNotice — the one string UJ3's "fallback is honest" promise
    //    rests on, and the token that measures 2.96:1 on the wrong ground.
    expect(light).toContain("text-ink-2");
    expect(light).not.toContain("text-on-dark-text");
  });

  it("omits the kicker unless asked — the confirmation surface has none", () => {
    // The rail draws the model's kicker above the steps; the confirmation did
    // not before this story and does not after it. The kicker is referenced
    // through the fixture below, never quoted — the AC5 gate sweeps this file.
    const without = renderToStaticMarkup(<SlaStepper sla={EN} tone="light" />);
    const with_ = renderToStaticMarkup(<SlaStepper sla={EN} tone="light" showKicker />);
    expect(without).not.toContain(EN.kicker);
    expect(with_).toContain(EN.kicker);
  });

  it("keeps the badge frame HUGGING so translated badges cannot clip", () => {
    // The canvas draws a fixed 46x34 box, which fits "24h" and clips "24 saat".
    // P5: replace `min-w-[46px]` with `w-[46px]` and this reddens.
    const html = renderToStaticMarkup(<SlaStepper sla={EN} tone="onDark" />);
    // The positive assertion IS the P5: swapping `min-w-` for `w-` makes this
    // fail. A negative on "w-[46px]" could never pass, because "min-w-[46px]"
    // contains it as a substring.
    expect(html).toContain("min-w-[46px]");
    expect(html).toContain("min-h-[34px]");
  });
});
