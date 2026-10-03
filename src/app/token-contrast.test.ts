import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The design system's WCAG AA contrast contract (Story 5.4 — NFR3, AC1/AC2).
 *
 * ⚠️ READS THE REAL HEXES FROM `globals.css`, never a copy. A token darkened (or
 * lightened) in the stylesheet is judged here directly, so this is the single gate
 * that "all token pairings pass AA" (the AC) rather than a second place the values
 * live. axe (`e2e/a11y.spec.ts`) only sweeps the pages it visits; THIS covers every
 * documented token×surface pairing, including admin ones axe never reaches.
 *
 * Thresholds: 4.5:1 for normal text (every pairing below is normal-size text —
 * the project has no token used ONLY as large text). The contrast maths is WCAG
 * 2.x relative luminance, proven against black/white = 21 before it judges anything.
 *
 * Status tokens (`--color-status-*`) are deliberately NOT asserted: a grep proves
 * none is used as a text or UI class anywhere (the lead status is a labelled
 * `<select>`, not a colored badge), so holding the unused amber to 4.5 would be a
 * false gate. If a status color is ever rendered, add its pairing here.
 */

function channelLin(c8: number): number {
  const c = c8 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * channelLin(r) + 0.7152 * channelLin(g) + 0.0722 * channelLin(b);
}

function contrast(fg: string, bg: string): number {
  const a = luminance(fg) + 0.05;
  const b = luminance(bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}

/** Parse every `--color-NAME: #hex;` from the authoritative stylesheet. */
function readColorTokens(): Record<string, string> {
  const css = readFileSync("src/app/globals.css", "utf8");
  const tokens: Record<string, string> = {};
  for (const m of css.matchAll(/--color-([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

const T = readColorTokens();
const AA_NORMAL = 4.5;

/** Each pairing is text actually rendered in the product (see the Kicker table). */
const PAIRINGS: { fg: string; bg: string; note: string }[] = [
  { fg: "ink", bg: "surface", note: "primary text on white" },
  { fg: "ink", bg: "surface-2", note: "primary text on inset panels" },
  { fg: "ink-2", bg: "surface", note: "body/secondary on white" },
  { fg: "ink-2", bg: "surface-2", note: "body/secondary on inset panels" },
  { fg: "muted", bg: "surface", note: "tertiary labels/meta on white (5.4 fix)" },
  { fg: "muted", bg: "surface-2", note: "tertiary labels/meta on inset panels (5.4 fix — the binding surface)" },
  { fg: "error", bg: "surface", note: "validation error text on white" },
  { fg: "error", bg: "surface-2", note: "validation error text on inset panels" },
  { fg: "accent-soft", bg: "ink", note: "kicker on the dark band" },
  { fg: "on-dark-text", bg: "ink", note: "body copy on the dark band" },
];

describe("token contrast — the WCAG AA contract (Story 5.4)", () => {
  it("the contrast instrument is correct before it judges tokens", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrast("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("every documented token is present in globals.css", () => {
    for (const name of ["ink", "ink-2", "muted", "error", "accent-soft", "on-dark-text", "surface", "surface-2"]) {
      expect(T[name], `--color-${name} missing from globals.css`).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  for (const { fg, bg, note } of PAIRINGS) {
    it(`${fg} on ${bg} meets AA (${note})`, () => {
      const ratio = contrast(T[fg], T[bg]);
      expect(ratio, `${fg} (${T[fg]}) on ${bg} (${T[bg]}) = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
        AA_NORMAL,
      );
    });
  }

  it("white button text on the accent fill meets AA", () => {
    expect(contrast("#ffffff", T["accent"])).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // UI-component / non-text contrast is 3:1 (WCAG 1.4.11). `muted` is used as a
  // BORDER (SearchForm) and a placeholder; axe does not contrast-check either, so
  // this is the only guard for those uses. The 5.4 darken clears it comfortably.
  it("muted as a UI boundary (SearchForm border, placeholder) meets 1.4.11 on both light surfaces", () => {
    const UI_MIN = 3;
    expect(contrast(T["muted"], T["surface"])).toBeGreaterThanOrEqual(UI_MIN);
    expect(contrast(T["muted"], T["surface-2"])).toBeGreaterThanOrEqual(UI_MIN);
  });
});
