import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import {
  getCatalogPageData,
  getSearchPageData,
  categoryParamOf,
  searchQueryOf,
  filterSlugOf,
  catalogSignals,
  flattenTree,
} from "@/server/catalog-page";
import { listSeriesOptions, listManufacturerOptions } from "@/server/repositories/series";
import { getSitePhone } from "@/server/repositories/site-settings";
import { Breadcrumb, type Crumb } from "@/components/ui";
import { ProductCard } from "@/components/catalog/ProductCard";
import { CategoryChips, pathTo } from "@/components/catalog/CategoryChips";
import { CatalogEmptyState } from "@/components/catalog/CatalogEmptyState";
import { SearchForm } from "@/components/catalog/SearchForm";
import { SearchFilterChips } from "@/components/catalog/SearchFilterChips";
import { SearchEmptyState } from "@/components/catalog/SearchEmptyState";
import { CONTAINER } from "@/components/layout/container";
import type { ProductCardItem } from "@/server/repositories/product";
import type { SearchSuggestion } from "@/server/repositories/product";

/**
 * SSR per request — reads live DB content, so it must never be baked into the
 * static build. Reading `searchParams` opts into dynamic rendering anyway (it is
 * a request-time API); this makes the intent explicit and uniform with every
 * other public route.
 *
 * THERE IS DELIBERATELY NO `generateStaticParams` — a DB-reading one breaks the
 * Postgres-free build even under `force-dynamic`, and a warm Redis MASKS the
 * failure (both measured in Story 2.1).
 */
export const dynamic = "force-dynamic";

type CatalogSearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

interface ParsedCatalogParams {
  q: string | null;
  categorySlug: string | null;
  manufacturerSlug: string | null;
  seriesSlug: string | null;
  /**
   * True when ANY 2.5 surface is active (`?q`, `?manufacturer`, `?series`).
   * A bare `?category` view stays on the 2.2 path — its cached reads, its
   * container-category semantics, its FR16 states — untouched.
   */
  isSearchView: boolean;
}

async function parseParams(searchParams: CatalogSearchParams): Promise<ParsedCatalogParams> {
  const raw = await searchParams;
  const q = searchQueryOf(raw.q);
  const categorySlug = categoryParamOf(raw.category);
  const manufacturerSlug = filterSlugOf(raw.manufacturer);
  const seriesSlug = filterSlugOf(raw.series);
  return {
    q,
    categorySlug,
    manufacturerSlug,
    seriesSlug,
    isSearchView: q !== null || manufacturerSlug !== null || seriesSlug !== null,
  };
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
  searchParams: CatalogSearchParams;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const parsed = await parseParams(props.searchParams);
  // Both branches share their request-memo with the page body — same primitive
  // arguments, same `cache()` entry, reads run once.
  const data = parsed.isSearchView
    ? await getSearchPageData(
        parsed.q,
        parsed.categorySlug,
        parsed.manufacturerSlug,
        parsed.seriesSlug,
        locale,
      )
    : await getCatalogPageData(parsed.categorySlug, locale);
  const t = await getTranslations({ locale, namespace: "Catalog" });

  return {
    // The title may name the active category — a tab label is presentation — but
    // everything a CRAWLER consolidates on is view-independent by design:
    title: data.category ? `${data.category.name} · ${t("title")}` : t("title"),
    description: t("subhead"),
    // CANONICAL-TO-CLEAN (2.2 Task 0 / AC7, extended to 2.5's params): every
    // `?category`, `?q`, `?manufacturer` and `?series` view canonicals to the
    // bare `/products`, so filtered and searched views are one page to a crawler
    // and the sitemap lists exactly one URL per locale.
    alternates: alternatesFor(locale, "/products"),
    // View-independent robots — catalogSignals takes only the tree, so this
    // CANNOT differ between the clean, filtered and searched views of the same
    // canonical.
    robots: robotsFor(catalogSignals(locale, data.tree)),
  };
}

/**
 * The product catalog (Story 2.2 — FR4, FR13, FR16; Story 2.5 — FR17, FR17a,
 * FR19; UJ2's entry surface).
 *
 * Layout per the recovered mock (the UX decision log's "Products / Catalog +
 * Search screen"): header zone on `surface-2` (breadcrumb → H1 → subhead →
 * search → category navigation → facet rows) → body on `surface` (count toolbar
 * → card grid). Story 2.5 delivered the mock's search bar and the FR17 facet
 * rows; the mock's SIDEBAR shape and Sort control are deliberately not built —
 * no FR requires Sort (2.2's "Sort arrives with 2.5" was scope-carving, not a
 * requirement), and the chip-row idiom replaces the sidebar (decision Q3).
 *
 * The H1 stays "Product catalog" on every view: `?category`, `?q` and the
 * facet params are all FILTER VIEWS of one canonical page (architecture:102),
 * and the active state is carried by the breadcrumb, the chips and the toolbar.
 */
export default async function ProductsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: CatalogSearchParams;
}) {
  const { locale } = await props.params;
  // Self-validate the segment rather than relying on the layout's guard order —
  // and narrow `locale` to the routing union the repositories accept.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const parsed = await parseParams(props.searchParams);
  const t = await getTranslations({ locale, namespace: "Catalog" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  // The facet option rows render on every view (cached reads, cheap and warm).
  const [manufacturers, seriesOptions] = await Promise.all([
    listManufacturerOptions(locale),
    listSeriesOptions(locale),
  ]);

  // Story 4.8: the admin-managed phone (SITE fallback) for the empty-state tel: CTAs.
  const phone = await getSitePhone();

  // ---- Data: the 2.5 search branch, or the 2.2 catalog branch, untouched ----
  let tree, category;
  let categoryNotFound = false;
  let products: ProductCardItem[];
  let shownCount: number;
  let suggestions: readonly SearchSuggestion[] = [];

  if (parsed.isSearchView) {
    const data = await getSearchPageData(
      parsed.q,
      parsed.categorySlug,
      parsed.manufacturerSlug,
      parsed.seriesSlug,
      locale,
    );
    tree = data.tree;
    category = data.category;
    // A requested-but-unknown category is still a failed lookup on a search view
    // (2.5 review: the flag was dropped here, so the chips claimed "All products"
    // was current while ?category=nonsense was in the URL).
    categoryNotFound = parsed.categorySlug !== null && data.category === null;
    products = data.products;
    // The UNCAPPED match count — searchProducts returns it separately precisely
    // so the toolbar cannot report the 60-row cap as the total (2.2's rule).
    shownCount = data.total;
    suggestions = data.suggestions;
  } else {
    const data = await getCatalogPageData(parsed.categorySlug, locale);
    tree = data.tree;
    category = data.category;
    categoryNotFound = data.categoryNotFound;
    products = data.products;
    // Uncapped truth for the toolbar (2.2 review): the category's own count and
    // the tree sums are cap-free.
    shownCount = category
      ? category.publishedCount
      : flattenTree(tree).reduce((sum, node) => sum + node.publishedCount, 0);
  }

  // Breadcrumb from the TREE PATH, not CategoryDetail.parent — the parent field
  // carries one level, so at depth 3 the trail silently lost the root (2.2
  // review). The path gives full ancestry at any depth.
  const ancestry = category ? (pathTo(tree, category.slug) ?? []) : [];
  const crumbs: Crumb[] =
    ancestry.length === 0
      ? [{ label: tNav("products") }]
      : [
          { label: tNav("products"), href: "/products" },
          ...ancestry.slice(0, -1).map((node) => ({
            label: node.name,
            href: `/products?category=${node.slug}`,
            isFallback: node.isFallback,
          })),
          {
            label: ancestry[ancestry.length - 1].name,
            isFallback: ancestry[ancestry.length - 1].isFallback,
          },
        ];

  const catalogIsEmpty = !parsed.isSearchView && !parsed.categorySlug && products.length === 0;

  // FR16 is for DEAD ENDS. A container category — zero direct products but
  // populated children — is not one: its children ARE its content, and rendering
  // "range expanding" directly under a child chip counting products was a lie
  // the 2.2 review caught. The empty state shows only when there is nowhere
  // further down to go. (The search view has its own emptiness rules below.)
  const showCatalogEmptyState =
    !parsed.isSearchView &&
    products.length === 0 &&
    (categoryNotFound || !category || category.children.length === 0);

  return (
    <>
      <Breadcrumb items={crumbs} />

      {/* Header zone — continues the breadcrumb's surface-2 fill (the mock draws
          them as one zone); the body below separates by a fill change, so no
          hairline here (hairline OR fill change, never both). */}
      <section className="bg-surface-2">
        <div className={`${CONTAINER} pb-8 pt-6 md:pb-10`}>
          <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">{t("subhead")}</p>
          <SearchForm
            query={parsed.q}
            categorySlug={parsed.categorySlug}
            manufacturerSlug={parsed.manufacturerSlug}
            seriesSlug={parsed.seriesSlug}
          />
          <CategoryChips
            tree={tree}
            active={category}
            categoryNotFound={categoryNotFound}
            view={{
              q: parsed.q,
              manufacturerSlug: parsed.manufacturerSlug,
              seriesSlug: parsed.seriesSlug,
            }}
          />
          <SearchFilterChips
            params={{
              q: parsed.q,
              categorySlug: parsed.categorySlug,
              manufacturerSlug: parsed.manufacturerSlug,
              seriesSlug: parsed.seriesSlug,
            }}
            manufacturers={manufacturers}
            series={seriesOptions}
          />
        </div>
      </section>

      <section className="bg-surface">
        <div className={`${CONTAINER} py-10 md:py-12`}>
          {/* The toolbar count line. The NUMBER is machine data → IBM Plex Mono
              (`font-data`), per DESIGN.md's mono split — the surrounding label
              stays in the label voice. Number-first order verified in all three
              locales, so the split needs no per-locale reordering. */}
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
            <span className="font-data normal-case">{shownCount}</span>{" "}
            {t("countNoun", { count: shownCount })} · {t("countTail")}
          </p>

          {parsed.isSearchView && products.length === 0 ? (
            <div className="mt-6">
              {parsed.q ? (
                /* FR17a's state: the query matched nothing. Suggestions, the
                   browse path (the chips above stay live), and the RFQ pre-fill. */
                <SearchEmptyState query={parsed.q} suggestions={suggestions} phone={phone} />
              ) : (
                /* Facet-only zero (e.g. an unknown-but-well-formed
                   ?manufacturer): there is no query to echo or suggest around.
                   FR16's copy names a CATEGORY, so it is only honest when a
                   category is actually the filter — otherwise the generic
                   catalog variant speaks (2.5 review). */
                <CatalogEmptyState
                  variant={parsed.categorySlug ? "category" : "catalog"}
                  phone={phone}
                />
              )}
            </div>
          ) : showCatalogEmptyState ? (
            <div className="mt-6">
              {/* FR16's state for the true dead ends: an empty LEAF category, an
                  unknown ?category value, or an empty catalog. A container
                  category with populated children skips this — its children row
                  above IS the content. The unknown case is NOT 2.1's soft-404
                  problem: /products is a real page whatever the param says, so
                  200 is simply correct. */}
              <CatalogEmptyState variant={catalogIsEmpty ? "catalog" : "category"} phone={phone} />
            </div>
          ) : products.length > 0 ? (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <li key={product.id} className="flex">
                  <ProductCard product={product} />
                </li>
              ))}
            </ul>
          ) : /* Container category: zero direct products, populated children — the
                 children chips above are the content, so no grid and no false
                 empty state. Deliberately nothing here. */ null}
        </div>
      </section>
    </>
  );
}
