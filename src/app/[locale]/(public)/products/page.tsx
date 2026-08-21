import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import {
  getCatalogPageData,
  categoryParamOf,
  catalogSignals,
  flattenTree,
} from "@/server/catalog-page";
import { Breadcrumb, type Crumb } from "@/components/ui";
import { ProductCard } from "@/components/catalog/ProductCard";
import { CategoryChips, pathTo } from "@/components/catalog/CategoryChips";
import { CatalogEmptyState } from "@/components/catalog/CatalogEmptyState";
import { CONTAINER } from "@/components/layout/container";

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

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
  searchParams: CatalogSearchParams;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const categorySlug = categoryParamOf((await props.searchParams).category);
  const data = await getCatalogPageData(categorySlug, locale);
  const t = await getTranslations({ locale, namespace: "Catalog" });

  return {
    // The title may name the active category — a tab label is presentation — but
    // everything a CRAWLER consolidates on is view-independent by design:
    title: data.category ? `${data.category.name} · ${t("title")}` : t("title"),
    description: t("subhead"),
    // CANONICAL-TO-CLEAN (Task 0 / AC7): every `?category` view canonicals to the
    // bare `/products`, so filtered views are one page to a crawler and the
    // sitemap lists exactly one URL per locale. Measured live at dev time — see
    // the Dev Agent Record for the curl evidence.
    alternates: alternatesFor(locale, "/products"),
    // View-independent robots — catalogSignals takes only the tree, so this
    // CANNOT differ between the clean and filtered views of the same canonical.
    robots: robotsFor(catalogSignals(locale, data.tree)),
  };
}

/**
 * The product catalog (Story 2.2 — FR4, FR13, FR16; UJ2's entry surface).
 *
 * Layout per the recovered mock (the UX decision log's "Products / Catalog +
 * Search screen" — the .pen file is gone, the log's description survives):
 * header zone on `surface-2` (breadcrumb → H1 → subhead → category navigation) →
 * body on `surface` (count toolbar → card grid). The mock's search bar, industry
 * chips, filter sidebar and Sort control are ALL Story 2.5 — deliberately absent,
 * not stubbed.
 *
 * The H1 stays "Product catalog" on every view: `?category` views are FILTER
 * VIEWS of one canonical page (Task 0, option A per architecture:102), and the
 * active category is carried by the breadcrumb, the chips and the toolbar.
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

  const categorySlug = categoryParamOf((await props.searchParams).category);
  const { tree, category, categoryNotFound, products } = await getCatalogPageData(
    categorySlug,
    locale,
  );
  const t = await getTranslations({ locale, namespace: "Catalog" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

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

  const catalogIsEmpty = !categorySlug && products.length === 0;

  // FR16 is for DEAD ENDS. A container category — zero direct products but
  // populated children — is not one: its children ARE its content, and rendering
  // "range expanding" directly under a child chip counting products was a lie
  // the 2.2 review caught. The empty state shows only when there is nowhere
  // further down to go.
  const showEmptyState =
    products.length === 0 && (categoryNotFound || !category || category.children.length === 0);

  // Uncapped truth for the toolbar (2.2 review): `products.length` would report
  // the 60-row cap as the total once the catalog ramps, while the chips beside it
  // show real DB counts. The category's own count and the tree sums are cap-free.
  const shownCount = category
    ? category.publishedCount
    : flattenTree(tree).reduce((sum, node) => sum + node.publishedCount, 0);

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
          <CategoryChips tree={tree} active={category} categoryNotFound={categoryNotFound} />
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

          {showEmptyState ? (
            <div className="mt-6">
              {/* FR16's state for the true dead ends: an empty LEAF category, an
                  unknown ?category value, or an empty catalog. A container
                  category with populated children skips this — its children row
                  above IS the content. The unknown case is NOT 2.1's soft-404
                  problem: /products is a real page whatever the param says, so
                  200 is simply correct. */}
              <CatalogEmptyState variant={catalogIsEmpty ? "catalog" : "category"} />
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
