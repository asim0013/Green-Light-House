import { Package } from "lucide-react";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { ProductCardItem } from "@/server/repositories/product";

/**
 * Product Card (Story 2.1, pulled forward from Story 2.2 — UX-DR5).
 *
 * Built HERE because the industry landing page's Featured-products block needs it
 * and `src/components/catalog/` was empty; the alternative was a throwaway card now
 * and the real one in 2.2, i.e. the same block built twice. Story 2.2 reuses this.
 *
 * DESIGN.md § Components: `surface`, 1px border, thumb (`surface-2`, 140h, centered
 * line icon, bottom hairline) → body (mono MANUFACTURER, Geist title, spec rows).
 * Sharp corners, flat, no shadow. **No price anywhere** (FR2) — there is no price
 * field in the schema to render even by accident.
 *
 * THE FOOTER IS DELIBERATELY ABSENT. DESIGN.md specifies a footer with an ungated
 * "Datasheet ↓" and an "Add to inquiry" outline button, but ungated document
 * download is Story 2.3 and the RFQ is Epic 3. DP-12 forbids linking to a page that
 * does not exist yet, and Story 1.6's review escalated exactly this problem after
 * links to unbuilt routes multiplied. The footer lands with its targets.
 *
 * The card is also not itself a link: product detail is Story 2.4.
 *
 * Presentational only — it takes resolved data, so it renders with zero specs and
 * stays unit-testable without a database.
 */
export function ProductCard({ product }: { product: ProductCardItem }) {
  return (
    // `w-full`: grid cells wrap the card in a flex <li>, where a flex item
    // shrink-to-fits its text — measured as a ragged, misaligned grid (2.2
    // review). The card always fills its cell.
    <article className="flex w-full flex-col border border-border-subtle bg-surface">
      {/* Thumbnail stand-in. Real product photography replaces the icon (DESIGN.md
          § Shapes); until then the icon is decorative and the card's accessible
          name comes from the heading below, so it is hidden from assistive tech. */}
      <div className="flex h-[140px] items-center justify-center border-b border-border-subtle bg-surface-2">
        <Package size={40} strokeWidth={1.25} className="text-muted" aria-hidden />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-5">
        {/* The manufacturer name falls back INDEPENDENTLY of the product name, so it
            carries its own `lang` and its own notice — marking only the string that
            actually fell back (FR34a / AC6). */}
        <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
          <span lang={product.manufacturer.isFallback ? "en" : undefined}>
            {product.manufacturer.name}
          </span>
          <FallbackNotice isFallback={product.manufacturer.isFallback} />
        </span>

        <h3 className="font-heading text-base font-semibold text-ink">
          <span lang={product.isFallback ? "en" : undefined}>{product.name}</span>
          <FallbackNotice isFallback={product.isFallback} />
        </h3>

        {/* The model designation is machine data — IBM Plex Mono, per the
            "if a machine produced it, it's `data` mono" rule. */}
        <span className="font-data text-[13px] text-ink-2">{product.model}</span>

        {product.specs.length > 0 && (
          <dl className="mt-2 flex flex-col">
            {product.specs.map((spec, index) => (
              <div
                // Index, not label: `hazArea`, `haz_area` and `haz-area` all humanize to
                // "Haz area", so distinct attributes can collide on the same key.
                key={`${spec.label}-${index}`}
                className="flex items-baseline justify-between gap-3 border-b border-border-subtle py-1.5 last:border-b-0"
              >
                <dt className="text-[13px] text-ink-2">{spec.label}</dt>
                <dd className="font-data text-[13px] text-ink">{spec.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </article>
  );
}
