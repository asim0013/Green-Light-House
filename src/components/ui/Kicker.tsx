import type { ReactNode } from "react";

/**
 * Kicker (Story 1.5) — mono 11, UPPERCASE, tracked. The "label voice" above a
 * section title. `accent-soft` by default (and on dark bands); `muted` for
 * non-essential labels on light.
 */
export function Kicker({
  children,
  tone = "accent",
  className = "",
}: {
  children: ReactNode;
  tone?: "accent" | "muted";
  className?: string;
}) {
  const color = tone === "muted" ? "text-muted" : "text-accent-soft";
  return (
    <span className={`font-mono text-[11px] uppercase tracking-[0.15em] ${color} ${className}`}>
      {children}
    </span>
  );
}
