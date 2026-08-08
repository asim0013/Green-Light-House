import type { ReactNode } from "react";
import { BadgeCheck } from "lucide-react";

/**
 * Chip / badge (Story 1.5) — rectangular (sharp), mono 11. `filled` uses a
 * `surface-2` fill; `outline` uses a hairline border. The `cert` flag prepends a
 * `brand`-green badge-check (the only non-logo use of green, per DESIGN.md).
 */
export function Chip({
  children,
  variant = "filled",
  cert = false,
  className = "",
}: {
  children: ReactNode;
  variant?: "filled" | "outline";
  cert?: boolean;
  className?: string;
}) {
  const surface = variant === "outline" ? "border border-border-subtle bg-surface" : "bg-surface-2";
  return (
    <span
      className={`inline-flex items-center gap-1 ${surface} px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-2 ${className}`}
    >
      {cert && <BadgeCheck size={13} className="text-brand" aria-hidden />}
      {children}
    </span>
  );
}
