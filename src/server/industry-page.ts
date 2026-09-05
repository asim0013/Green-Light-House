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

/**
 * The canonical path for an industry landing page.
 *
 * `encodeURIComponent` is NOT decoration. `getPathname` does not encode, and Next
 * does not escape sitemap URLs either — measured against
 * `next/dist/build/webpack/loaders/metadata/resolve-route-data.js`, which emits
 * `<loc>${item.url}</loc>` with no escaping whatsoever. So a slug containing `&`,
 * `<` or `"` produces MALFORMED XML and breaks `/sitemap.xml` for every locale at
 * once, not just its own entry.
 *
 * Story 2.1 is the first change to interpolate a DATABASE-derived string into that
 * file — before it the sitemap held three fixed locale homepages — and nothing in
 * the schema constrains `Industry.slug` beyond `@unique`, so Epic 4's admin can
 * store anything a human types. Encoding here is a no-op for a well-formed slug
 * (lowercase ASCII + hyphens, per the Story 2.1 slug rule) and contains the damage
 * for anything else.
 *
 * Used by BOTH `sitemap.ts` and the page's `alternatesFor`, so the canonical URL and
 * the sitemap URL can never disagree about the same page.
 */
export function industryHref(slug: string): string {
  return `/industries/${encodeURIComponent(slug)}`;
}

/** How many rows each block shows. No `featured` column exists; ordering is by slug. */
// 3, matching the 3-column grid EXPERIENCE.md § Responsive specifies. It was 4,
// which came from the missing Pencil mock rather than the spines and left a single
// orphan card on a second row once the grid was corrected.
export const PRODUCT_LIMIT = 3;
export const PROJECT_LIMIT = 3;
export const CERTIFICATE_LIMIT = 6;
// 5, one per FR23 competency — raised from 4 by the Story 2.6 review. The cap had
// never bound: the seed had exactly four services until 2.6 split the merged
// `kitting-logistics` row into `project-kitting` + `logistics`. At 4 it silently
// dropped `tender-support` (slug-ascending + `take`), and `IndustrySection` has no
// view-all affordance, so that competency had no path onward from this page. This
// is a COMPLETE set, not a teaser like PRODUCT_LIMIT — if services ever outgrow
// FR23's five, revisit with a link to /services rather than by raising this again.
export const SERVICE_LIMIT = 5;

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
 * FR42a's signals for the `/industries` INDEX page.
 *
 * Separate from `industrySignals` because the index is a different surface with
 * different content: it lists the industry set, so it is thin only when there are no
 * industries at all — NOT when the landing pages it points to happen to be thin. An
 * index of six sectors is a real page even if every sector page is empty.
 *
 * It exists as a shared function for the same reason `industrySignals` does: the
 * page's `robots` metadata and the sitemap's inclusion rule MUST come from one
 * predicate. They previously did not — the page indexed on `industries.length > 0`
 * while the sitemap gated on "at least one landing page is indexable", so six thin
 * industries produced a page saying `index, follow` that the sitemap refused to
 * list. Harmless in direction (the dangerous case, `noindex` + advertised, could not
 * occur) but the docstring claiming one source of truth was simply untrue.
 */
export function industriesIndexSignals(
  locale: Locale,
  industries: readonly { isFallback: boolean }[],
): ContentSignals {
  return {
    locale,
    itemCount: industries.length,
    fallbackFields: industries.filter((row) => row.isFallback).length,
    totalFields: industries.length,
  };
}

/**
 * FR42a's thin-content signals for one industry LANDING page.
 *
 * `itemCount` counts BLOCK rows only, never the industry itself — otherwise every
 * industry that exists would score at least 1 and no page could ever be thin, which
 * is the opposite of the policy. Story decision Q4: any non-empty block ⇒
 * indexable; all blocks empty ⇒ thin. On the current seed that makes construction,
 * manufacturing and nuclear `noindex` and absent from the sitemap.
 *
 * The FALLBACK signals DO include the industry's own name/description, because that
 * text is the page's `<h1>`: a page whose every rendered BLOCK string fell back to
 * EN genuinely has nothing of its own in the requested locale.
 *
 * ⚠️ "EVERY RENDERED STRING" IS NO LONGER LITERALLY TRUE, and that is the fourth
 * docstring Story 3.5 falsifies — the story rewrote three and missed this one.
 * This page mounts TWO SLA surfaces (`IndustryHero` and `IndustryCta`), and since
 * 3.5 that copy is DB content with its own per-locale rows, so it can be fully
 * Turkish while every block on the page fell back to EN. It is deliberately NOT
 * counted here, for the reason `services-page.ts` and `sitemap.ts` give: the SLA
 * is site-wide chrome, and a translated chrome element must never be the evidence
 * that a thin page deserves indexing.
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
