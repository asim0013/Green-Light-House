import { cache } from "react";
import type { Locale } from "@prisma/client";
import { getIndustryBySlug } from "@/server/repositories/industry";
import { listCategoriesByIndustry } from "@/server/repositories/category";
import { listCertificatesByIndustry } from "@/server/repositories/document";
import { listServicesByIndustry } from "@/server/repositories/service";
import { listProductsByIndustry } from "@/server/repositories/product";
import { listProjectsByIndustry } from "@/server/repositories/project";
import type { ContentSignals } from "@/lib/seo";

/**
 * Everything the industry landing page reads, in ONE place (Story 2.1).
 *
 * This is a server module rather than a helper inside the route because
 * `sitemap.ts` needs the identical predicate: AC7 requires that the `robots`
 * metadata on a page and that page's presence in the sitemap can never disagree.
 * If each computed indexability for itself they would drift, and the failure is
 * silent — a `noindex` page still advertised in the sitemap is exactly the mixed
 * signal FR42a exists to prevent. Story 1.9 hit this and fixed it by making both
 * sides call one function; this keeps that property for Epic 2's first surface.
 */

/** How many rows each block shows. No `featured` column exists; ordering is by slug. */
export const PRODUCT_LIMIT = 4;
export const PROJECT_LIMIT = 3;
export const CERTIFICATE_LIMIT = 6;
export const SERVICE_LIMIT = 4;

/**
 * The page's six reads, memoised for the REQUEST.
 *
 * `generateMetadata` and the page body both need this data — metadata to decide
 * indexability from what is ACTUALLY rendered, the body to render it — and Next
 * runs them as separate calls. Story 1.8's `cached()` makes each read cheap ACROSS
 * requests but does not deduplicate WITHIN one: without this wrapper every read ran
 * twice, and on a true miss (cold cache, tag invalidation, Redis down) both callers
 * fell through to Postgres. Measured on the homepage: 8 Redis lookups instead of 4.
 *
 * React's `cache()` is request-scoped, so the second caller gets the first's promise.
 */
export const getIndustryPageData = cache(async (slug: string, locale: Locale) => {
  const industry = await getIndustryBySlug(slug, locale);
  // Short-circuit: an unknown slug renders the not-found body, so the five block
  // reads would be five pointless round trips on a URL anyone can type.
  if (!industry) return null;

  const [categories, certificates, services, products, projects] = await Promise.all([
    listCategoriesByIndustry(slug, locale),
    listCertificatesByIndustry(slug, locale, CERTIFICATE_LIMIT),
    listServicesByIndustry(slug, locale, SERVICE_LIMIT),
    listProductsByIndustry(slug, locale, PRODUCT_LIMIT),
    listProjectsByIndustry(slug, locale, PROJECT_LIMIT),
  ]);

  return { industry, categories, certificates, services, products, projects };
});

export type IndustryPageData = NonNullable<Awaited<ReturnType<typeof getIndustryPageData>>>;

/**
 * FR42a's thin-content signals for one industry page.
 *
 * `itemCount` counts BLOCK rows only, never the industry itself — otherwise every
 * industry that exists would score at least 1 and no page could ever be thin, which
 * is the opposite of the policy. Story decision Q4: any non-empty block ⇒
 * indexable; all blocks empty ⇒ thin. On the current seed that makes construction,
 * manufacturing and nuclear `noindex` and absent from the sitemap.
 *
 * The FALLBACK signals DO include the industry's own name/description, because that
 * text is the page's `<h1>`: a page whose every rendered string fell back to EN
 * genuinely has nothing in the requested locale.
 */
export function industrySignals(locale: Locale, data: IndustryPageData): ContentSignals {
  const blockRows = [
    ...data.categories,
    ...data.certificates,
    ...data.services,
    ...data.products,
    ...data.projects,
  ];
  const translated = [data.industry, ...blockRows];

  return {
    locale,
    itemCount: blockRows.length,
    fallbackFields: translated.filter((row) => row.isFallback).length,
    totalFields: translated.length,
  };
}
