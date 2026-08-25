import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl, alternatesFor, isIndexable } from "@/lib/seo";
import { listIndustries } from "@/server/repositories/industry";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listTopLevelCategories } from "@/server/repositories/category";
import { listPublishedProjects } from "@/server/repositories/project";
import {
  getIndustryPageData,
  industrySignals,
  industriesIndexSignals,
  industryHref,
} from "@/server/industry-page";
import { listCategoryTree } from "@/server/repositories/category";
import { catalogSignals } from "@/server/catalog-page";
import { listProductSignals } from "@/server/repositories/product";
import { signalsFromRow, productHref } from "@/server/product-page";
import { listServices } from "@/server/repositories/service";
import { servicesSignals } from "@/server/services-page";

/**
 * `/sitemap.xml` (Story 1.9 — FR42, FR42a).
 *
 * NOT NEGOTIABLE — do not remove this line. `app/sitemap.ts` compiles to a Route
 * Handler that Next CACHES BY DEFAULT, which means it is evaluated during
 * `next build`. Because this file reads the database, that would break the hard
 * constraint carried from Story 1.3 that a build must never require Postgres.
 * Measured, not assumed: without it, `npm run build` with Postgres stopped fails
 * with `Error occurred prerendering page "/sitemap.xml"` and exits 1; with it, the
 * same build succeeds and the route is listed as `ƒ` and absent from
 * `.next/prerender-manifest.json`.
 */
export const dynamic = "force-dynamic";

/**
 * Scope: the three locale homepages, the `/industries` index, and every INDEXABLE
 * `/industries/<slug>` (Story 2.1 extended this).
 *
 * The nav and footer in `src/config/site.ts` also point at Products/Projects/
 * Services/About, `/rfq` and the legal pages — none of which exist until Epic 2/3/5.
 * Listing them would publish a sitemap of 404s, which is worse for indexation than
 * publishing nothing. Each later story extends the loop below as its surface lands.
 *
 * FR42a ("the sitemap lists only populated pages") is enforced with the SAME
 * predicate the page's `robots` metadata uses — `isIndexable` for the collection
 * pages, and `industrySignals` from `@/server/industry-page` for the industry
 * pages, which is the very function that route's `generateMetadata` calls. One
 * source of truth per surface, so a page can never be `noindex` while the sitemap
 * still advertises it.
 *
 * All reads go through repositories, never Prisma directly (architecture
 * § Architectural Boundaries), and each is cached in Redis by Story 1.8.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The three locales are independent — read them concurrently rather than
  // awaiting each in turn, which tripled this route's latency for no reason.
  const perLocale = await Promise.all(
    routing.locales.map(async (locale) => {
      const [projects, industries, categories, manufacturers, categoryTree, productRows, services] =
        await Promise.all([
          listPublishedProjects(locale, 1),
          listIndustries(locale),
          listTopLevelCategories(locale),
          listManufacturers(locale),
          // One tree read is the WHOLE catalog gate (Story 2.2): catalogSignals is
          // deliberately tree-only, so /products costs no per-product reads here.
          listCategoryTree(locale),
          // ONE query for every published product (Story 2.4 decision Q3). A
          // per-product read would make /sitemap.xml scale with the catalogue,
          // repeating the industry N+1 already deferred above — and React cache()
          // cannot rescue it, being INERT in Route Handlers (measured, Story 2.1).
          listProductSignals(locale),
          // The Services page's own read (Story 2.6) — one query, and the SAME
          // predicate its generateMetadata calls.
          listServices(locale),
        ]);

      const translated = [...projects, ...industries, ...categories, ...manufacturers];
      const collectionsIndexable = isIndexable({
        locale,
        itemCount: translated.length,
        fallbackFields: translated.filter((row) => row.isFallback).length,
        totalFields: translated.length,
      });

      // Per-industry indexability, computed with the page's own function so the two
      // cannot drift. Concurrent across industries for the same reason as above.
      const industrySlugs = await Promise.all(
        industries.map(async (industry) => {
          const data = await getIndustryPageData(industry.slug, locale);
          if (!data) return null;
          return isIndexable(industrySignals(locale, data)) ? industry.slug : null;
        }),
      );

      return {
        locale,
        collectionsIndexable,
        // The `/industries` index is gated by the index page's OWN predicate — the
        // same function its generateMetadata calls — not by whether the landing
        // pages happen to be indexable. Those are different surfaces: an index
        // listing six sectors is real content even when every sector page is thin.
        // Gating it on the landing pages made the page say `index, follow` while
        // the sitemap silently omitted it.
        indexIndexable: isIndexable(industriesIndexSignals(locale, industries)),
        // The catalog gate — the SAME function /products generateMetadata calls
        // (one predicate per surface). Category-filtered views canonical to clean
        // /products, so the sitemap grows by exactly this one URL per locale.
        catalogIndexable: isIndexable(catalogSignals(locale, categoryTree)),
        // One predicate per surface: `servicesSignals` is what /services' robots
        // metadata uses, so page and sitemap cannot disagree.
        servicesIndexable: isIndexable(servicesSignals(locale, services)),
        // Per-product gates from the SAME function the detail page metadata calls
        // (signalsFromRow / signalsFromPageData both delegate to productSignals),
        // computed from the batched rows — no extra read per product.
        indexableProductSlugs: productRows
          .filter((row) => isIndexable(signalsFromRow(locale, row)))
          .map((row) => row.slug),
        indexableIndustrySlugs: industrySlugs.filter((slug): slug is string => slug !== null),
      };
    }),
  );

  // INCLUSION is gated by indexability (FR42a: "the sitemap lists only populated
  // pages"). The hreflang map is NOT — it comes from the same `alternatesFor`
  // the page metadata uses, so the two can never advertise different alternate
  // sets for the same URL. An earlier version built a filtered map here and also
  // dropped `x-default`, which made page and sitemap disagree.
  const entry = (locale: (typeof routing.locales)[number], href: string) => ({
    url: absoluteUrl(locale, href),
    alternates: { languages: alternatesFor(locale, href).languages },
  });

  return perLocale.flatMap(
    ({
      locale,
      collectionsIndexable,
      indexIndexable,
      catalogIndexable,
      indexableIndustrySlugs,
      indexableProductSlugs,
      servicesIndexable,
    }) => [
      ...(collectionsIndexable ? [entry(locale, "/")] : []),
      ...(indexIndexable ? [entry(locale, "/industries")] : []),
      ...(catalogIndexable ? [entry(locale, "/products")] : []),
      ...(servicesIndexable ? [entry(locale, "/services")] : []),
      // `industryHref`, not a template literal: Next does NOT escape sitemap URLs,
      // so an unencoded `&` or `<` in a slug makes the WHOLE FILE malformed XML.
      ...indexableIndustrySlugs.map((slug) => entry(locale, industryHref(slug))),
      // , not a template literal — same XML-escaping reason.
      ...indexableProductSlugs.map((slug) => entry(locale, productHref(slug))),
    ],
  );
}
