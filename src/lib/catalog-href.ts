/**
 * The ONE composer for every `/products` view URL (Story 2.5, extracted in its
 * review).
 *
 * WHY IT IS SHARED. Story 2.5 gave the manufacturer/series chips a composer that
 * carefully carried `q` and the sibling facets, and gave the search form hidden
 * inputs that did the same — but left Story 2.2's `CategoryChips` emitting bare
 * `/products?category=<slug>` hrefs. So two of AC3's three composable facets
 * preserved state and the third silently reset it: a buyer who searched
 * "detector" and clicked a category chip to narrow lost the search and got MORE
 * results than before. Composition has to be a property of the URL layer, not a
 * habit each component remembers separately.
 *
 * Params are omitted when null, so the clean view stays exactly `/products` and
 * the canonical-to-clean rule is unaffected.
 */
export interface CatalogViewParams {
  q?: string | null;
  categorySlug?: string | null;
  manufacturerSlug?: string | null;
  seriesSlug?: string | null;
}

export function catalogHref(params: CatalogViewParams): string {
  const search = new URLSearchParams();
  // Stable key order so two callers building the same view produce the same
  // string — hrefs are compared in tests and by the browser's history.
  if (params.q) search.set("q", params.q);
  if (params.categorySlug) search.set("category", params.categorySlug);
  if (params.manufacturerSlug) search.set("manufacturer", params.manufacturerSlug);
  if (params.seriesSlug) search.set("series", params.seriesSlug);
  const qs = search.toString();
  return qs ? `/products?${qs}` : "/products";
}
