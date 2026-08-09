import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl, isIndexable } from "@/lib/seo";
import { listIndustries } from "@/server/repositories/industry";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listTopLevelCategories } from "@/server/repositories/category";
import { listPublishedProjects } from "@/server/repositories/project";

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
 * Scope is deliberately the three locale homepages.
 *
 * The nav and footer in `src/config/site.ts` point at Industries/Products/Projects/
 * Services/About, `/rfq` and the legal pages — none of which exist until Epic 2/3/5.
 * Listing them would publish a sitemap of 404s, which is worse for indexation than
 * publishing nothing. Epic 2 extends the loop below as its surfaces land.
 *
 * FR42a ("the sitemap lists only populated pages") is enforced with the SAME
 * `isIndexable` predicate the page's `robots` metadata uses — one source of truth,
 * so a page can never be `noindex` while the sitemap still advertises it.
 *
 * All reads go through repositories, never Prisma directly (architecture
 * § Architectural Boundaries), and each is cached in Redis by Story 1.8.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const indexableLocales: string[] = [];

  for (const locale of routing.locales) {
    const [projects, industries, categories, manufacturers] = await Promise.all([
      listPublishedProjects(locale, 1),
      listIndustries(locale),
      listTopLevelCategories(locale),
      listManufacturers(locale),
    ]);

    const translated = [...projects, ...industries, ...categories, ...manufacturers];
    const indexable = isIndexable({
      locale,
      itemCount: translated.length,
      fallbackFields: translated.filter((row) => row.isFallback).length,
      totalFields: translated.length,
    });

    if (indexable) indexableLocales.push(locale);
  }

  // Build the alternates map from the indexable locales only: pointing hreflang at
  // a locale we have just decided to keep out of the index would re-advertise it.
  const languages = Object.fromEntries(
    indexableLocales.map((locale) => [locale, absoluteUrl(locale, "/")]),
  );

  return indexableLocales.map((locale) => ({
    url: absoluteUrl(locale, "/"),
    alternates: { languages },
  }));
}
