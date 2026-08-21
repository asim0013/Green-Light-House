import { cache } from "react";
import type { Locale } from "@prisma/client";
import {
  listPublishedProducts,
  listProductsByCategory,
  type ProductCardItem,
} from "@/server/repositories/product";
import {
  listCategoryTree,
  getCategoryBySlug,
  type CategoryTreeNode,
  type CategoryDetail,
} from "@/server/repositories/category";
import type { ContentSignals } from "@/lib/seo";

/**
 * Everything the `/products` catalog reads, in ONE place (Story 2.2).
 *
 * A server module rather than page-local helpers for the same reason
 * `industry-page.ts` is: `sitemap.ts` must gate `/products` with the IDENTICAL
 * predicate the page's `robots` metadata uses (AC7 — the 2.1 review PROVED that
 * two predicates for one surface reach the harmful direction, a `noindex` page
 * the sitemap still advertises).
 */

/**
 * The slug gate (Story 2.2, Task 0 — closes the deferred slug-validation item for
 * this surface). The 2.1 slug rule: lowercase ASCII + digits, hyphen-separated,
 * stored not derived. Anything else never reaches a query OR a cache key — the
 * `?category` value is attacker-controlled, and 2.1's review measured both the
 * unbounded-entry exposure and the >247-char tag log-amplification this bounds.
 */
// Lifted to src/lib/slug.ts in Story 2.3 (the download handler gates on the same
// rule); re-exported here so existing imports and tests keep working.
export { isValidSlug } from "@/lib/slug";
import { isValidSlug } from "@/lib/slug";

/**
 * Normalize the raw `?category` searchParam. Next 16 types the value as
 * `string | string[] | undefined` — a repeated `?category=a&category=b` arrives as
 * an array (Task 0 decision: first value wins). Returns the validated slug, or
 * null when absent/malformed — the caller renders the unfiltered catalog or the
 * FR16 empty state, never a crash.
 */
export function categoryParamOf(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return null;
  return isValidSlug(first) ? first : null;
}

export interface CatalogPageData {
  /** The whole tree, for the navigation chips/tiles. */
  tree: CategoryTreeNode[];
  /** The selected category, null when browsing unfiltered — or when unknown. */
  category: CategoryDetail | null;
  /** True when a category was REQUESTED but does not exist (FR16 state). */
  categoryNotFound: boolean;
  /** The grid: all published products, or the selected category's direct ones. */
  products: ProductCardItem[];
}

/**
 * The page's reads, memoised for the REQUEST (React `cache()` — effective in the
 * RSC render path where `generateMetadata` and the body both call this; it is
 * INERT in Route Handlers, so `sitemap.ts` deliberately does NOT use it).
 */
export const getCatalogPageData = cache(
  async (categorySlug: string | null, locale: Locale): Promise<CatalogPageData> => {
    if (!categorySlug) {
      const [tree, products] = await Promise.all([
        listCategoryTree(locale),
        listPublishedProducts(locale),
      ]);
      return { tree, category: null, categoryNotFound: false, products };
    }

    const [tree, category] = await Promise.all([
      listCategoryTree(locale),
      getCategoryBySlug(categorySlug, locale),
    ]);
    if (!category) {
      // Unknown category ⇒ the FR16 empty state with the navigation still live.
      // NOT the 2.1 soft-404 problem: /products is a real page whatever the param
      // says, so 200 is simply correct here.
      return { tree, category: null, categoryNotFound: true, products: [] };
    }

    const products = await listProductsByCategory(categorySlug, locale);
    return { tree, category, categoryNotFound: false, products };
  },
);

/** Flatten the tree for signal counting — depth-agnostic like the assembler. */
export function flattenTree(nodes: readonly CategoryTreeNode[]): CategoryTreeNode[] {
  return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

/**
 * FR42a's thin-content signals for `/products` (one predicate, page AND sitemap).
 *
 * Computed from the CATEGORY TREE ALONE, deliberately, for two properties:
 *
 * 1. VIEW-INDEPENDENCE. Every `?category` view canonicals to clean `/products`,
 *    so they are one page to a crawler — and one page must emit ONE robots
 *    signal. Deriving signals from the filtered product list would make
 *    `/products?category=fixed-suppression` say `noindex` while its canonical
 *    target says `index` — the exact mixed signal the one-predicate rule exists
 *    to prevent.
 * 2. `itemCount` is still the PUBLISHED PRODUCT count, not the category count:
 *    the tree carries per-node `publishedCount`, and their sum is the catalog's
 *    real content. A structure-only deploy (categories, no products) is thin.
 *
 * The trade recorded plainly: product-level fallback flags do not feed the
 * fallback-only rule here — category names are the catalog's structural strings,
 * and a locale whose entire tree fell back has nothing of its own to index.
 * `sitemap.ts` gets the same verdict from ONE `listCategoryTree` read.
 */
export function catalogSignals(locale: Locale, tree: readonly CategoryTreeNode[]): ContentSignals {
  const nodes = flattenTree(tree);
  return {
    locale,
    itemCount: nodes.reduce((sum, node) => sum + node.publishedCount, 0),
    fallbackFields: nodes.filter((node) => node.isFallback).length,
    totalFields: nodes.length,
  };
}
