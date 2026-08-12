import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl, alternatesFor, isIndexable } from "@/lib/seo";
import { listIndustries } from "@/server/repositories/industry";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listTopLevelCategories } from "@/server/repositories/category";
import { listPublishedProjects } from "@/server/repositories/project";
import { getIndustryPageData, industrySignals } from "@/server/industry-page";

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
      const [projects, industries, categories, manufacturers] = await Promise.all([
        listPublishedProjects(locale, 1),
        listIndustries(locale),
        listTopLevelCategories(locale),
        listManufacturers(locale),
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
        // `/industries` is a signpost onto the landing pages: it earns a place only
        // when at least one of them does, otherwise the sitemap advertises an index
        // of pages it is itself refusing to list.
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

  return perLocale.flatMap(({ locale, collectionsIndexable, indexableIndustrySlugs }) => [
    ...(collectionsIndexable ? [entry(locale, "/")] : []),
    ...(indexableIndustrySlugs.length > 0 ? [entry(locale, "/industries")] : []),
    ...indexableIndustrySlugs.map((slug) => entry(locale, `/industries/${slug}`)),
  ]);
}
