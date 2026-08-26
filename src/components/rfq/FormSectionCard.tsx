import type { ReactNode } from "react";

/**
 * One numbered card of the RFQ form (Story 3.2, AC1/AC5 — "1 · Your project" /
 * "2 · Your details"; the numeral and middot are part of the STRING, not
 * chrome).
 *
 * ⚠️ THE WHITE FILL IS LOAD-BEARING, NOT DECOR. `/rfq` is the one page built
 * white-cards-on-`surface-2` (the canvas's deliberate inversion), and the
 * shipped `border-muted` control border passes 1.4.11 ONLY against `surface` —
 * on `surface-2` it fails. Every form control must sit inside this card's
 * `bg-surface` body; a future re-layout that flattens the cards away silently
 * crosses that contrast line (measured in the 3.2 context fleet).
 */
export function FormSectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border border-border-subtle bg-surface p-5 md:p-6">
      <h2 className="font-heading text-[17px] font-bold tracking-tight text-ink">{title}</h2>
      <div className="mt-5 flex flex-col gap-5">{children}</div>
    </section>
  );
}
