import { cache } from "react";
import type { Locale } from "@prisma/client";
import {
  getProductBySlug,
  listRelatedProducts,
  listAccessoriesForProduct,
  toSpecRows,
  type ProductSignalRow,
} from "@/server/repositories/product";
import { listDocumentsByProduct } from "@/server/repositories/document";
import { listCategoryTree } from "@/server/repositories/category";
import type { ContentSignals } from "@/lib/seo";

/**
 * Everything the product detail page reads, in ONE place (Story 2.4).
 *
 * A server module rather than helpers inside the route, for the reason
 * `industry-page.ts` gives: `sitemap.ts` needs the IDENTICAL indexability
 * predicate. A `noindex` page still advertised in the sitemap is the mixed signal
 * FR42a exists to prevent, and these two sides have silently drifted before
 * (Story 1.9 hit it; the 2.1 review found the `/industries` index doing it again).
 */

/**
 * The canonical path for a product detail page.
 *
 * `encodeURIComponent` is NOT decoration. Next does not escape sitemap URLs — its
 * metadata loader emits `<loc>${item.url}</loc>` verbatim (measured in Story 2.1
 * against `resolve-route-data.js`), so a slug containing `&`, `<` or `"` produces
 * MALFORMED XML and breaks `/sitemap.xml` for EVERY locale at once, not just its
 * own entry. Nothing in the schema constrains `Product.slug` beyond `@unique`.
 *
 * Used by BOTH `sitemap.ts` and the page's `alternatesFor`, so the canonical URL
 * and the sitemap URL can never disagree about the same page.
 */
export function productHref(slug: string): string {
  return `/products/${encodeURIComponent(slug)}`;
}

/**
 * The page's four reads, memoised for the REQUEST.
 *
 * `generateMetadata` and the page body both need this data and Next runs them as
 * separate calls. Story 1.8's `cached()` makes each read cheap ACROSS requests but
 * does not deduplicate WITHIN one — without this wrapper every read runs twice,
 * and on a true miss (cold cache, tag invalidation, Redis down) both callers fall
 * through to Postgres.
 *
 * React's `cache()` is request-scoped, so the second caller gets the first's
 * promise. It works HERE because this is a page; it is INERT in Route Handlers
 * (measured in 2.1: 3 calls → 3 executions), which is why `sitemap.ts` gets a
 * single batched read instead.
 */
export const getProductPageData = cache(async (slug: string, locale: Locale) => {
  const product = await getProductBySlug(slug, locale);
  // Short-circuit: an unknown or unpublished slug renders the not-found body, so
  // the three block reads would be three pointless round trips on a URL anyone
  // can type.
  if (!product) return null;

  const [documents, related, accessories, tree] = await Promise.all([
    listDocumentsByProduct(slug, locale),
    listRelatedProducts(slug, locale),
    listAccessoriesForProduct(slug, locale),
    // The breadcrumb needs FULL category ancestry, and `ProductDetail.category`
    // carries one level. The 2.2 review replaced exactly that shortcut on the
    // catalog page after it silently lost the root at depth 3 — `pathTo` walks the
    // tree instead, so the trail is depth-agnostic. Same cached read the catalog
    // page makes, so it is normally warm.
    listCategoryTree(locale),
  ]);

  return { product, documents, related, accessories, tree };
});

export type ProductPageData = NonNullable<Awaited<ReturnType<typeof getProductPageData>>>;

/**
 * The fields FR42a's thin-content rule actually depends on.
 *
 * Deliberately narrow so BOTH callers can produce it cheaply: the page has full
 * `ProductPageData`, while `sitemap.ts` has one batched row per product. If this
 * needed anything more (related products, say), the sitemap would be forced into
 * a per-product read — the N+1 that decision Q3 exists to prevent.
 */
export interface ProductSignalSource {
  isFallback: boolean;
  manufacturerIsFallback: boolean;
  categoryIsFallback: boolean;
  specCount: number;
  documentCount: number;
}

/**
 * FR42a's thin-content signals for one product detail page.
 *
 * `itemCount` counts the page's SUBSTANTIVE rows — spec rows plus public
 * documents — never the product itself. Counting the product would give every
 * product that exists a score of at least 1, so no page could ever be thin, which
 * is the opposite of the policy. A catalogue stub with no attributes and no
 * documents is exactly what "empty" means here.
 *
 * RELATED PRODUCTS AND ACCESSORIES ARE NOT COUNTED, on purpose: they are other
 * products' content. A bare stub sitting in a well-populated category would
 * otherwise inherit indexability from its neighbours.
 *
 * The FALLBACK signals cover the three strings the page renders as its own
 * identity — product name, manufacturer, category — because those carry the `<h1>`
 * and its supporting line. A page whose every such string fell back to EN
 * genuinely has nothing in the requested locale.
 */
export function productSignals(locale: Locale, source: ProductSignalSource): ContentSignals {
  const fields = [source.isFallback, source.manufacturerIsFallback, source.categoryIsFallback];

  return {
    locale,
    itemCount: source.specCount + source.documentCount,
    fallbackFields: fields.filter(Boolean).length,
    totalFields: fields.length,
  };
}

/** Signals from the page's own data. */
export function signalsFromPageData(locale: Locale, data: ProductPageData): ContentSignals {
  return productSignals(locale, {
    isFallback: data.product.isFallback,
    manufacturerIsFallback: data.product.manufacturer.isFallback,
    categoryIsFallback: data.product.category.isFallback,
    specCount: toSpecRows(data.product.attributes, Number.MAX_SAFE_INTEGER).length,
    documentCount: data.documents.length,
  });
}

/** Signals from the sitemap's batched row — same function, same verdict. */
export function signalsFromRow(locale: Locale, row: ProductSignalRow): ContentSignals {
  return productSignals(locale, row);
}
