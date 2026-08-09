import type { ReactNode } from "react";
import { BadgeCheck } from "lucide-react";

export type ChipVariant = "filled" | "outline" | "onDark";

/**
 * Chip / badge (Story 1.5) — rectangular (sharp), mono 11. The `cert` flag
 * prepends a `brand`-green badge-check (the only non-logo use of green, per
 * DESIGN.md).
 *
 * Variant must match the surface. `filled` and `outline` both carry LIGHT
 * surfaces, so dropping either onto an `ink` band renders a solid light block —
 * visually a primary button, not a chip. `onDark` is the ink-band variant:
 * transparent fill, `on-dark-border` hairline, `on-dark-text` label
 * (10.66:1 on ink), with the green check at 4.92:1 (>3:1, non-text).
 */
export function Chip({
  children,
  variant = "filled",
  cert = false,
  className = "",
}: {
  children: ReactNode;
  variant?: ChipVariant;
  cert?: boolean;
  className?: string;
}) {
  const surface =
    variant === "onDark"
      ? "border border-on-dark-border bg-transparent text-on-dark-text"
      : variant === "outline"
        ? "border border-border-subtle bg-surface text-ink-2"
        : "bg-surface-2 text-ink-2";

  return (
    <span
      className={`inline-flex items-center gap-1 ${surface} px-2 py-1 font-mono text-[11px] uppercase tracking-wide ${className}`}
    >
      {cert && <BadgeCheck size={13} className="text-brand" aria-hidden />}
      {children}
    </span>
  );
}
