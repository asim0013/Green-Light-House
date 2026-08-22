import { useTranslations } from "next-intl";

/**
 * The grouped spec table (Story 2.4 — UX-DR8/UX-DR9).
 *
 * DESIGN.md § Components: `label` (Inter 13, `ink-2`) left, `value` (data mono 13,
 * `ink`) right, bottom hairline, under a mono group title.
 *
 * ONE GROUP, AND THAT IS DELIBERATE (decision Q2). UX-DR8 calls for a "grouped
 * spec table", but `Product.attributes` is FLAT JSONB — `{"hazArea": "ATEX Zone
 * 1", "response": "< 5 s"}` — with no grouping key anywhere in the schema or the
 * seed. Inventing a taxonomy (Electrical / Mechanical / Certification…) would mean
 * guessing which bucket every content-defined attribute belongs in, and getting it
 * wrong on every import. That is a content-model decision, and it is already
 * deferred as the "an editor cannot choose which spec rows to feature" item.
 *
 * So this renders the pattern honestly: a single mono group title over ungrouped
 * rows. When the schema grows real groups, this component takes an array of groups
 * and nothing else changes.
 *
 * Rows arrive pre-sorted from `toSpecRows` (code-point order — NOT `localeCompare`,
 * which measurably diverges across runtimes and would let two servers disagree
 * about a SHARED cached payload).
 */
export function ProductSpecTable({
  specs,
}: {
  specs: readonly { label: string; value: string }[];
}) {
  const t = useTranslations("Product");
  // No rows, no table: a heading over emptiness is the "blank region" the ACs
  // forbid. The page decides what (if anything) stands in its place.
  if (specs.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
        {t("specsTitle")}
      </h2>
      <dl className="mt-4 flex flex-col border-t border-border-subtle">
        {specs.map((spec, index) => (
          <div
            // Index, not label: `hazArea`, `haz_area` and `haz-area` all humanize
            // to "Haz area", so distinct attributes can collide on the same key.
            key={`${spec.label}-${index}`}
            className="flex items-baseline justify-between gap-6 border-b border-border-subtle py-2.5"
          >
            <dt className="text-[13px] text-ink-2">{spec.label}</dt>
            <dd className="text-right font-data text-[13px] text-ink">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
