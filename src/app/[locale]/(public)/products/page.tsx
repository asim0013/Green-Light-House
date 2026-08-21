import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { getCatalogPageData, categoryParamOf, catalogSignals } from "@/server/catalog-page";
import { Breadcrumb, type Crumb } from "@/components/ui";
import { ProductCard } from "@/components/catalog/ProductCard";
import { CategoryChips } from "@/components/catalog/CategoryChips";
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
  const { tree, category, products } = await getCatalogPageData(categorySlug, locale);
  const t = await getTranslations({ locale, namespace: "Catalog" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  // Breadcrumb: Products [→ parent] [→ current]. The trail ascends the tree —
  // which is also the only "back up" affordance the chips deliberately omit.
  const crumbs: Crumb[] = [{ label: tNav("products"), href: "/products" }];
  if (category?.parent) {
    crumbs.push({
      label: category.parent.name,
      href: `/products?category=${category.parent.slug}`,
      isFallback: category.parent.isFallback,
    });
  }
  if (category) {
    crumbs.push({ label: category.name, isFallback: category.isFallback });
  }
  if (crumbs.length === 1) crumbs[0] = { label: tNav("products") };

  const catalogIsEmpty = !categorySlug && products.length === 0;

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
          <CategoryChips tree={tree} active={category} />
        </div>
      </section>

      <section className="bg-surface">
        <div className={`${CONTAINER} py-10 md:py-12`}>
          {/* The toolbar count line — machine number in the data font. */}
          <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
            {t("countLine", { count: products.length })}
          </p>

          {products.length === 0 ? (
            <div className="mt-6">
              {/* One FR16 state serves the empty category, the unknown ?category
                  value, and the empty catalog — never a blank grid. The unknown
                  case is NOT 2.1's soft-404 problem: /products is a real page
                  whatever the param says, so 200 is simply correct. */}
              <CatalogEmptyState variant={catalogIsEmpty ? "catalog" : "category"} />
            </div>
          ) : (
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {products.map((product) => (
                <li key={product.id} className="flex">
                  <div className="flex w-full">
                    <ProductCard product={product} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
