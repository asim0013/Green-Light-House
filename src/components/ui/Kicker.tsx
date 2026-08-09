import type { ReactNode } from "react";

export type KickerTone = "accent" | "ink" | "muted";

/**
 * Kicker (Story 1.5) — mono 11, UPPERCASE, tracked. The "label voice" above a
 * section title.
 *
 * Tone must match the surface, because this component hard-codes 11px (small
 * text, AA needs 4.5:1) and the tokens do NOT all clear that bar. Ratios computed
 * from DESIGN.md's exact hexes, rounded DOWN so the numbers never overstate
 * headroom:
 *
 *   tone              on white   on surface-2   on ink
 *   `accent`  #5C86B5   3.79 ❌     3.53 ❌       4.68 ✅  (only 4% over the floor)
 *   `ink`     #5A6470   6.01 ✅     5.60 ✅       2.95 ❌
 *   `muted`   #8A93A0   3.10 ❌     2.89 ❌       5.72 ✅
 *
 * So `accent` (the default) is the DARK-BAND tone and `ink` is the light-surface
 * tone — including on `surface-2`, where every tone is worse than on white.
 * EXPERIENCE.md § Accessibility Floor anticipates exactly this and directs that
 * small labels carrying meaning "darken toward ink-2" — marked [VERIFY at build],
 * which is here.
 *
 * `muted` fails on both light surfaces and cannot be rescued by the "large text"
 * exemption, because the 11px size is fixed here — it is retained only for the
 * dark band, where it passes.
 */
export function Kicker({
  children,
  tone = "accent",
  className = "",
}: {
  children: ReactNode;
  tone?: KickerTone;
  className?: string;
}) {
  const color =
    tone === "muted" ? "text-muted" : tone === "ink" ? "text-ink-2" : "text-accent-soft";
  return (
    <span className={`font-mono text-[11px] uppercase tracking-[0.15em] ${color} ${className}`}>
      {children}
    </span>
  );
}
