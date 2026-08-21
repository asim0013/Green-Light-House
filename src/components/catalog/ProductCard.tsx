import { Package } from "lucide-react";
import { useTranslations } from "next-intl";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { formatDocMeta } from "@/lib/doc-meta";
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
 * THE FOOTER IS HALF-DELIVERED, BY DESIGN. DESIGN.md's `gf9DY` footer carries an
 * ungated "Datasheet ↓" and an "Add to inquiry" outline button. Story 2.3 landed
 * the datasheet link (rendered only when the product HAS a public datasheet);
 * "Add to inquiry" still waits for Epic 3's RFQ (DP-12 — never link a page that
 * does not exist). The download href is the /api route — a plain <a>, NOT the
 * next-intl Link: /api URLs carry no locale segment.
 *
 * The card is still not itself a link: product detail is Story 2.4.
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

      {product.datasheet && <CardFooter datasheet={product.datasheet} />}
    </article>
  );
}

/**
 * The half-footer (Story 2.3, decision Q1): hairline top per `gf9DY`, the
 * "Datasheet ↓" inline text-CTA left-aligned, format+size beside it in the data
 * font (the a11y floor's "state format + size in text" — inside the link, so the
 * accessible name carries it too). `mt-auto` pins it to the card's bottom edge so
 * grids of mixed-height cards keep a level footer line.
 */
function CardFooter({ datasheet }: { datasheet: NonNullable<ProductCardItem["datasheet"]> }) {
  const t = useTranslations("Catalog");
  const meta = formatDocMeta(datasheet.mime, datasheet.sizeBytes);

  return (
    <div className="mt-auto border-t border-border-subtle px-5 py-3">
      <a
        href={`/api/documents/${datasheet.slug}`}
        className="inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-accent hover:underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 sm:min-h-0"
      >
        {t("datasheet")}
        <span aria-hidden>↓</span>
        {meta && <span className="font-data text-xs font-normal text-ink-2">{meta}</span>}
      </a>
    </div>
  );
}
