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
 *   `muted`   #656E7B   5.16 ✅     4.81 ✅       3.45 ❌  (Story 5.4 darkened from #8A93A0)
 *
 * So `accent` (the default) is the DARK-BAND tone and `ink` is the light-surface
 * tone — including on `surface-2`, where every tone is worse than on white.
 * EXPERIENCE.md § Accessibility Floor directed that small labels carrying meaning
 * "darken toward ink-2" [VERIFY at build]; Story 5.4 discharged it by darkening
 * `--color-muted` itself, so `text-muted` now clears 4.5:1 on both light surfaces.
 *
 * ⚠️ The `muted` tone is UNUSED (grep: no `tone="muted"` anywhere) and the darken
 * INVERTED its safe surface — it now passes on light and FAILS on the dark band
 * (3.45:1). On a dark band use `accent`; this branch is kept only so `KickerTone`
 * stays stable, and must not be used on `ink`.
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
