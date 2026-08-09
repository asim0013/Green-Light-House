import type { ReactNode } from "react";

/**
 * DarkBand (Story 1.5) — an `ink` credibility/CTA band. It provides the dark
 * surface + on-dark text tokens: inside it, headings are white, kickers
 * `accent-soft`, hairlines `on-dark-border`, raised panels `on-dark-panel`, and
 * buttons use the `onDark*` variants (never navy). This primitive does NOT bleed
 * on its own — edge-to-edge full-bleed is composed by the page layout in 1.6/1.7
 * (place it outside the max-width container).
 */
export function DarkBand({
  children,
  className = "",
  as: Tag = "section",
}: {
  children: ReactNode;
  className?: string;
  /** Element to render. Use `footer` for the site footer so the `contentinfo` landmark survives. */
  as?: "section" | "footer" | "div";
}) {
  return <Tag className={`bg-ink text-on-dark-text ${className}`}>{children}</Tag>;
}
