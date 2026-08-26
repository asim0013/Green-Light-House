import type { ReactNode } from "react";

/**
 * Label + control + error slot for one RFQ field (Story 3.2, AC6).
 *
 * The label is VISIBLE, in the shipped mono-11 voice — not SearchForm's
 * `sr-only` pattern (that form's label is carried by its placeholder+button;
 * this one has ten fields and sighted users need the names). `text-ink-2`,
 * never `text-muted` (3.10:1 fails for 11px text). Strings are stored
 * NATURAL-CASE and uppercased here via CSS — Turkish İ breaks if the uppercase
 * is baked into the string (AC5).
 *
 * Error wiring is the caller's half: the control carries `aria-invalid` and
 * `aria-describedby={errorId}`; this component renders the matching error
 * element with that id. The error text is `text-error` (the token this story
 * minted — status amber fails 4.5:1) and the message itself is the non-color
 * cue, so color is never the only carrier (EXPERIENCE.md § a11y).
 */
export function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  /** The LOCALIZED error message, or undefined when the field is valid. */
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
        {label}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The control-side half of the wiring: spread onto the input/select/textarea
 * that `Field` wraps. Kept beside `Field` so the two halves cannot drift.
 */
export function fieldAria(id: string, hasError: boolean) {
  return {
    id,
    "aria-invalid": hasError || undefined,
    "aria-describedby": hasError ? `${id}-error` : undefined,
  } as const;
}

/**
 * Shared control classes (SearchForm's recipe: `border-muted` on the white card
 * fill, the `outline-hidden` + ring focus combo — never the `outline-none`
 * stragglers). `min-h-11` UNQUALIFIED — the 44px floor holds on desktop too,
 * not just under `max-sm:`. Invalid controls swap to the error border; the
 * border alone is not the cue (the message below is), it just matches it.
 */
export function controlClasses(hasError: boolean, extra = ""): string {
  return [
    "min-h-11 w-full border bg-surface px-3 text-[14px] text-ink",
    // ink-2, not muted (3.2 review): muted measures 3.10:1 on the white card
    // fill — under AA for 14px text — and the projectDetails placeholder is
    // genuine guidance, not a decorative example. ink-2 (6.01:1) still reads
    // as a hint beside the ink-valued entered text.
    "placeholder:text-ink-2",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent",
    hasError ? "border-error" : "border-muted",
    extra,
  ]
    .filter(Boolean)
    .join(" ");
}
