import type { ReactNode } from "react";

/**
 * DarkBand (Story 1.5) — a full-bleed `ink` credibility/CTA band. Inside it,
 * headings are white, kickers `accent-soft`, hairlines `on-dark-border`, and
 * raised panels `on-dark-panel`; buttons use the `onDark*` variants (never navy).
 * Page-level edge-to-edge bleed is composed by the layout in 1.6/1.7 — this
 * primitive provides the surface + on-dark text tokens.
 */
export function DarkBand({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <section className={`bg-ink text-on-dark-text ${className}`}>{children}</section>;
}
