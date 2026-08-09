import type { ReactNode } from "react";

export type KickerTone = "accent" | "ink" | "muted";

/**
 * Kicker (Story 1.5) — mono 11, UPPERCASE, tracked. The "label voice" above a
 * section title.
 *
 * Tone must match the surface, because kickers are 11px (small text, AA needs
 * 4.5:1) and the tokens do NOT all clear that bar. Measured against DESIGN.md's
 * exact hexes:
 *   - `accent` (accent-soft #5C86B5): 4.70:1 on `ink` ✅ · 3.80:1 on white ❌
 *   - `ink`    (ink-2 #5A6470):       6.01:1 on white ✅ · 2.97:1 on `ink` ❌
 *   - `muted`  (muted #8A93A0):       3.10:1 on white ❌ — non-essential/large only
 *
 * So: `accent` (the default) is the DARK-BAND tone, `ink` is the light-surface
 * tone. EXPERIENCE.md § Accessibility Floor anticipates exactly this and directs
 * that small labels carrying meaning "darken toward ink-2" — marked [VERIFY at
 * build], which is here.
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
