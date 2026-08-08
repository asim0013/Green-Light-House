export type ButtonVariant = "primary" | "secondary" | "onDarkPrimary" | "onDarkSecondary" | "link";

// Sharp corners, flat, Inter 15/600 (DESIGN.md Buttons). Navy `accent` is the only
// action color on light; on dark bands the primary inverts to white fill + ink label
// and the secondary is a white hairline. Never green, never a navy button on dark.
const BASE =
  "inline-flex items-center justify-center font-body text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
const PADDED = "px-5 py-[13px]";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: `${BASE} ${PADDED} bg-accent text-white hover:bg-accent/90`,
  secondary: `${BASE} ${PADDED} border-[1.5px] border-ink bg-surface text-ink hover:bg-surface-2`,
  onDarkPrimary: `${BASE} ${PADDED} bg-surface text-ink hover:bg-surface-2`,
  onDarkSecondary: `${BASE} ${PADDED} border-[1.5px] border-white bg-transparent text-white hover:bg-white/10`,
  link: `${BASE} gap-1 text-[14px] text-accent hover:underline underline-offset-4`,
};

/** Resolve the Tailwind class string for a button variant (reusable on <button> or <a>). */
export function buttonClasses(variant: ButtonVariant = "primary", className = ""): string {
  return `${VARIANTS[variant]} ${className}`.trim();
}
