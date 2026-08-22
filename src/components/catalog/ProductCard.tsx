import { Package } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
 * THE CARD IS NOW A LINK (Story 2.4) — to `/products/<slug>`, the detail page it
 * had been promising since 2.1. It is built as a STRETCHED OVERLAY, not a wrapper:
 * the heading holds the only `<a>`, and `after:absolute after:inset-0` extends its
 * hit area over the whole card. Wrapping the card in an anchor instead would nest
 * the footer's datasheet `<a>` inside it — invalid HTML, and browsers recover from
 * it unpredictably. This way the card has exactly TWO interactive elements, both
 * independently clickable and independently focusable, and a screen reader reads
 * one link named after the product rather than a link containing another link.
 *
 * The footer's download anchor sits at `relative z-10` so it stays above the
 * overlay; without that the stretched pseudo-element would swallow its clicks.
 *
 * KNOWN TRADE-OFF, accepted deliberately (2.4 review): the overlay owns
 * hit-testing for the whole card, so model numbers and spec values on a CARD
 * cannot be drag-selected with a mouse — the drag starts a link interaction
 * instead. Measured: selection on a card returns empty while the identical drag
 * on the detail page's h1 selects fine. The same strings are one click away on
 * the detail page, keyboard/AT users are unaffected, and the alternative
 * (heading-only link) loses the whole-card affordance buyers expect from a
 * catalogue grid. Recorded in deferred-work.md.
 *
 * Presentational only — it takes resolved data, so it renders with zero specs and
 * stays unit-testable without a database.
 */
export function ProductCard({ product }: { product: ProductCardItem }) {
  return (
    // `w-full`: grid cells wrap the card in a flex <li>, where a flex item
    // shrink-to-fits its text — measured as a ragged, misaligned grid (2.2
    // review). The card always fills its cell.
    // `relative` anchors the heading link's stretched overlay.
    <article className="relative flex w-full flex-col border border-border-subtle bg-surface transition-colors hover:border-ink-2">
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
          <Link
            href={`/products/${encodeURIComponent(product.slug)}`}
            className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <span lang={product.isFallback ? "en" : undefined}>{product.name}</span>
          </Link>
          {/* Outside the link: the notice is ABOUT the name, not part of it, and
              the accessible name should stay the product's own. */}
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

      {product.datasheet && <CardFooter datasheet={product.datasheet} model={product.model} />}
    </article>
  );
}

/**
 * The half-footer (Story 2.3, decision Q1): hairline top per `gf9DY`, the
 * "Datasheet ↓" inline text-CTA left-aligned, format+size beside it in the data
 * font (the a11y floor's "state format + size in text" — inside the link, so the
 * accessible name carries it too). `mt-auto` pins it to the card's bottom edge so
 * grids of mixed-height cards keep a level footer line.
 *
 * THE MODEL IS IN THE ACCESSIBLE NAME (2.3 review). Every card computed the
 * identical name — "Datasheet PDF · 602 B" — so a screen-reader links list on a
 * full catalogue page reads N indistinguishable entries and the user has to
 * abandon the rotor and linearise the grid. The model is already on the card, so
 * an `sr-only` copy names the file without touching the visual line.
 *
 * `focus-visible:outline-hidden`, NOT `outline-none`: in Tailwind v4 the latter
 * emits a real `outline: none`, and forced-colors mode (Windows High Contrast)
 * strips the box-shadow this ring is built from — leaving a keyboard user with no
 * focus indicator at all. `outline-hidden` keeps the transparent outline that
 * forced-colors promotes into a visible one.
 */
function CardFooter({
  datasheet,
  model,
}: {
  datasheet: NonNullable<ProductCardItem["datasheet"]>;
  model: string;
}) {
  const t = useTranslations("Catalog");
  const meta = formatDocMeta(datasheet.mime, datasheet.sizeBytes);

  return (
    <div className="mt-auto border-t border-border-subtle px-5 py-3">
      <a
        href={`/api/documents/${datasheet.slug}`}
        className="relative z-10 inline-flex items-center gap-2 text-[14px] font-semibold text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11"
      >
        {t("datasheet")}
        <span className="sr-only"> {model}</span>
        <span aria-hidden>↓</span>
        {meta && <span className="font-data text-xs font-normal text-ink-2">{meta}</span>}
      </a>
    </div>
  );
}
