import type { ReactNode } from "react";

/**
 * TwoColumn (Story 1.5) — the canonical GLH two-column layout: a `fill_container`
 * main column (`flex-1`) beside a FIXED-width side column.
 *
 * NEVER use `justify-between` + an `end`-aligned / fit-content child to push the
 * side element right — the layout engine mis-resolves that and overflows
 * (DESIGN.md § Do's & Don'ts, verified in the Pencil canvas). Fixed width is how
 * quote boxes (420), facts cards (380), and RFQ sidebars (360) sit on the edge.
 */
export function TwoColumn({
  main,
  side,
  sideWidth = 360,
  className = "",
}: {
  main: ReactNode;
  side: ReactNode;
  sideWidth?: number;
  className?: string;
}) {
  return (
    <div className={`flex gap-5 ${className}`}>
      <div className="min-w-0 flex-1">{main}</div>
      <div className="shrink-0" style={{ width: sideWidth }}>
        {side}
      </div>
    </div>
  );
}
