import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSlaContent } from "@/server/repositories/sla";
import { getSitePhone } from "@/server/repositories/site-settings";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { isValidSlug } from "@/lib/slug";
import { getProductPageData, signalsFromPageData, productHref } from "@/server/product-page";
import { toSpecRows } from "@/server/repositories/product";
import { Breadcrumb, type Crumb } from "@/components/ui";
import { pathTo } from "@/components/catalog/CategoryChips";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ProductSpecTable } from "@/components/catalog/ProductSpecTable";
import { ProductDocuments } from "@/components/catalog/ProductDocuments";
import { ProductAnchorCard } from "@/components/catalog/ProductAnchorCard";
import { ProductNotFound } from "@/components/catalog/ProductNotFound";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";

/**
 * SSR per request — this reads live DB content, so it must not be baked into the
 * static build (a build must never require a running Postgres). Tag-based ISR
 * caching layers onto the same read path via Story 1.8's `cached()`.
 */
export const dynamic = "force-dynamic";

/**
 * THERE IS DELIBERATELY NO `generateStaticParams` HERE, and `force-dynamic` above
 * is NOT what makes that safe.
 *
 * Next's build executes `buildAppStaticPaths` for ANY route with dynamic segments,
 * with no `dynamic` check — it skips only segments that do not export the function.
 * So a database-reading `generateStaticParams` would break the Postgres-free build
 * even with `force-dynamic` set. Omitting it is REQUIRED, not a style choice;
 * together the two are sufficient, and nothing here is prerendered.
 *
 * A warm Redis also MASKS that failure (Story 2.1 measured a DB-reading gSP
 * building cleanly against a stopped Postgres because `cached()` served it), which
 * is why CI blanks `REDIS_URL` for the build step.
 */

/**
 * THE SLUG GATE (AC4). Runs before any query or cache key is built, using the
 * shared `isValidSlug` that Story 2.2 introduced and 2.3 lifted into `lib/slug`.
 *
 * BE HONEST ABOUT WHAT IT BOUNDS: SHAPE and LENGTH (lowercase ASCII + hyphens,
 * ≤64 chars), never CARDINALITY. A well-formed unknown slug still reaches the
 * repository and still mints a cache entry — that exposure is a known, deferred
 * item shared with `getCategoryBySlug` and `getDocumentBySlug`, and one
 * existence-check fix closes all three. What the gate does close is the malformed
 * -value class and the oversized-cache-tag log amplification.
 */
function gateSlug(slug: string): string | null {
  return isValidSlug(slug) ? slug : null;
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  // `params` is a Promise in the page and in generateMetadata (Next 16). Typed
  // inline rather than with `PageProps<…>`, which does not typecheck until a build
  // has regenerated `.next/types`.
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Product" });
  const safeSlug = gateSlug(slug);
  const data = safeSlug ? await getProductPageData(safeSlug, locale) : null;

  if (!data) {
    // A slug that resolves to nothing — malformed, unknown, or DRAFT — must never
    // be indexed. Next injects `noindex` automatically for a real 404 STATUS; this
    // page deliberately returns 200 (see ProductNotFound for the measurements), so
    // it must say so itself. No canonical or hreflang either: they would advertise
    // a page that isn't there.
    return { title: t("notFoundTitle"), robots: { index: false, follow: true } };
  }

  return {
    title: data.product.name,
    description: data.product.description ?? undefined,
    // The same helper the sitemap uses, so canonical and sitemap can never
    // disagree about this URL.
    alternates: alternatesFor(locale, productHref(data.product.slug)),
    // The same predicate the sitemap gates inclusion on — one source of truth per
    // surface, so a `noindex` page can never stay advertised.
    robots: robotsFor(signalsFromPageData(locale, data)),
  };
}

/**
 * Product detail page (Story 2.4 — FR14; UJ2's climax: "he opens Product detail
 * and downloads the datasheet with no form").
 *
 * Layout follows DESIGN.md § Do's — "push side elements right with
 * `fill_container` main + fixed-width side column": breadcrumb strip → header →
 * fill-left main (specs, documents, related, accessories) + the fixed-width
 * anchor card on the right.
 *
 * The route owns every read; each section is presentational and renders correctly
 * with zero rows — sections with nothing to show are omitted rather than rendered
 * as an empty region.
 */
export default async function ProductDetailPage(props: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await props.params;
  // Self-validate the segment rather than relying on the layout's guard order (the
  // App Router renders layout and page concurrently). This also narrows `locale` to
  // the routing union, which is what the repositories' Prisma enum accepts.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // Story 3.5: ONE read per request, threaded down. The components cannot fetch
  // (see `SlaStepper`), and `getSlaContent` is React-`cache()`d so a page mounting
  // two consumers still makes a single round trip.
  const sla = await getSlaContent(locale);
  const phone = await getSitePhone(); // Story 4.8 — admin-managed phone (SITE fallback)

  const safeSlug = gateSlug(slug);
  const data = safeSlug ? await getProductPageData(safeSlug, locale) : null;
  const t = await getTranslations({ locale, namespace: "Product" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  if (!data) {
    return (
      <>
        <Breadcrumb
          items={[{ label: tNav("products"), href: "/products" }, { label: t("notFoundCrumb") }]}
        />
        <ProductNotFound />
      </>
    );
  }

  const { product, documents, related, accessories, tree } = data;

  // Full ancestry from the tree walk, not `product.category` alone — the trail must
  // survive a category nested more than one level deep (2.2 review).
  const ancestry = pathTo(tree, product.category.slug) ?? [];
  const crumbs: Crumb[] = [
    { label: tNav("products"), href: "/products" },
    ...ancestry.map((node) => ({
      label: node.name,
      href: `/products?category=${node.slug}`,
      isFallback: node.isFallback,
    })),
    { label: product.name, isFallback: product.isFallback },
  ];

  // The table shows EVERY attribute; `CARD_SPEC_ROWS` (2) is the card's limit, not
  // this page's.
  const specs = toSpecRows(product.attributes, Number.MAX_SAFE_INTEGER);

  return (
    <>
      <Breadcrumb items={crumbs} />

      {/* Header zone continues the breadcrumb's surface-2 fill (one zone); the body
          separates by a fill change, so no hairline here — DESIGN.md § Layout
          allows a hairline OR a fill change, never both. */}
      <section className="bg-surface-2">
        <div className={`${CONTAINER} pb-8 pt-6 md:pb-10`}>
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
            <span lang={product.manufacturer.isFallback ? "en" : undefined}>
              {product.manufacturer.name}
            </span>
            <FallbackNotice isFallback={product.manufacturer.isFallback} />
          </span>
          <h1 className="mt-3 font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            <span lang={product.isFallback ? "en" : undefined}>{product.name}</span>
            <FallbackNotice isFallback={product.isFallback} />
          </h1>
          <p className="mt-2 font-data text-[15px] text-ink-2">{product.model}</p>
          {product.description && (
            <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
              {product.description}
            </p>
          )}
        </div>
      </section>

      <section className="bg-surface">
        <div className={`${CONTAINER} flex flex-col gap-10 py-10 lg:flex-row lg:items-start`}>
          <div className="min-w-0 flex-1">
            <ProductSpecTable specs={specs} />
            <ProductDocuments documents={documents} />
            <RelatedGrid title={t("relatedTitle")} products={related} />
            <RelatedGrid title={t("accessoriesTitle")} products={accessories} />
          </div>

          <ProductAnchorCard product={product} sla={sla} phone={phone} />
        </div>
      </section>
    </>
  );
}

/**
 * Related products and compatible accessories share one presentation — both are
 * card grids over the SAME `ProductCardItem`, so they share the component rather
 * than duplicating the grid twice.
 *
 * Renders NOTHING when empty. That is the AC's "when absent, the section is
 * omitted cleanly", and for accessories it is the only reachable path on the
 * current seed: `accessory_compatibilities` has zero rows repo-wide.
 */
function RelatedGrid({
  title,
  products,
}: {
  title: string;
  products: readonly React.ComponentProps<typeof ProductCard>["product"][];
}) {
  if (products.length === 0) return null;

  return (
    <section className="mt-12">
      <h2 className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">{title}</h2>
      <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id} className="flex">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}
