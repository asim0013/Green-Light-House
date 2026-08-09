import type { CSSProperties, ReactNode } from "react";

/** Breakpoint at which the stacked layout becomes the two-column layout. */
export type StackAt = "md" | "lg" | "xl";

/**
 * Per-breakpoint class pairs. These MUST be complete static strings — Tailwind
 * scans source text, so a runtime-assembled `${stackAt}:flex-row` would never be
 * generated.
 */
const STACK: Record<StackAt, { row: string; side: string }> = {
  md: { row: "md:flex-row", side: "md:w-[var(--gl-side-w)]" },
  lg: { row: "lg:flex-row", side: "lg:w-[var(--gl-side-w)]" },
  xl: { row: "xl:flex-row", side: "xl:w-[var(--gl-side-w)]" },
};

/**
 * TwoColumn (Story 1.5; responsive stacking added in 1.7) — the canonical GLH
 * two-column layout: a `fill_container` main column (`flex-1`) beside a
 * FIXED-width side column.
 *
 * NEVER use `justify-between` + an `end`-aligned / fit-content child to push the
 * side element right — the layout engine mis-resolves that and overflows
 * (DESIGN.md § Do's & Don'ts, verified in the Pencil canvas). Fixed width is how
 * quote boxes (420), facts cards (380), and RFQ sidebars (360) sit on the edge.
 *
 * Below `stackAt` the columns stack and the side goes FULL width — otherwise the
 * fixed side crushes the main column on a phone (EXPERIENCE.md § Responsive:
 * "two-column patterns collapse to single column ... the side card moves below").
 * The width travels as the `--gl-side-w` custom property because an inline
 * `style` width cannot be made conditional on a breakpoint.
 */
export function TwoColumn({
  main,
  side,
  sideWidth = 360,
  stackAt = "lg",
  className = "",
}: {
  main: ReactNode;
  side: ReactNode;
  sideWidth?: number;
  stackAt?: StackAt;
  className?: string;
}) {
  const { row, side: sideWidthClass } = STACK[stackAt];

  return (
    <div
      className={`flex flex-col gap-5 ${row} ${className}`}
      style={{ "--gl-side-w": `${sideWidth}px` } as CSSProperties}
    >
      <div className="min-w-0 flex-1">{main}</div>
      <div className={`w-full shrink-0 ${sideWidthClass}`}>{side}</div>
    </div>
  );
}
