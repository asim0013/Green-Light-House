import { cache } from "react";
import type { Locale } from "@prisma/client";
import {
  getProjectBySlug,
  listPublishedProjects,
  type ProjectListItem,
} from "@/server/repositories/project";
import type { ContentSignals } from "@/lib/seo";

// Re-exported so existing importers keep one obvious home for it. The definition
// lives in a LEAF module because components need it — see that file.
export { projectHref } from "@/lib/project-href";

/**
 * Everything the Projects surfaces read, in ONE place (Story 3.1 — FR21).
 *
 * A server module rather than helpers inside the routes, for the reason
 * `industry-page.ts`, `product-page.ts` and `services-page.ts` all give:
 * `sitemap.ts` needs the IDENTICAL indexability predicate. A `noindex` page still
 * advertised in the sitemap is the mixed signal FR42a exists to prevent, and these
 * two sides have silently drifted THREE times in this project (1.9, the 2.1
 * review's `/industries` index, and the 2.4 review's product signals).
 */

/**
 * The detail page's read, memoised for the REQUEST.
 *
 * `generateMetadata` and the page body both need it and Next runs them as separate
 * calls; Story 1.8's `cached()` makes the read cheap ACROSS requests but does not
 * deduplicate WITHIN one. React's `cache()` is request-scoped, so the second caller
 * gets the first's promise.
 *
 * PRIMITIVE ARGUMENTS ONLY. `cache()` memoises by argument identity, so an options
 * object built fresh in both call sites would never be `===` and the memo would
 * silently never hit — running every read twice, which is the exact failure the
 * wrapper exists to prevent (the 2.4 review's lesson, recorded at
 * `catalog-page.ts`). It also works HERE because this is a page; `cache()` is INERT
 * in Route Handlers (measured in 2.1), which is why `sitemap.ts` batches instead.
 */
export const getProjectPageData = cache(async (slug: string, locale: Locale) => {
  return getProjectBySlug(slug, locale);
});

/** The index page's read, memoised for the REQUEST. */
export const getProjectsPageData = cache(async (locale: Locale): Promise<ProjectListItem[]> => {
  return listPublishedProjects(locale);
});

/**
 * FR42a's thin-content signals for the `/projects` INDEX.
 *
 * A DIFFERENT QUESTION FROM WHETHER ANY ONE PROJECT IS THIN — the 2.1 review's
 * lesson about `/industries`: an index listing real delivered work is real content
 * even when an individual entry is sparse. So this counts projects, and a
 * zero-project index is the only thin case.
 *
 * The fallback signals count the projects themselves, because on this surface the
 * project titles ARE the content. On the current seed there are zero `ru` project
 * translations, so every row falls back and `/ru/projects` is fallback-only ⇒
 * `noindex` ⇒ absent from the sitemap. That is correct, not a bug: the page has
 * nothing in the requested language, and the visible FallbackNotice says so.
 */
export function projectsIndexSignals(
  locale: Locale,
  projects: readonly ProjectListItem[],
): ContentSignals {
  return {
    locale,
    itemCount: projects.length,
    fallbackFields: projects.filter((project) => project.isFallback).length,
    totalFields: projects.length,
  };
}

/**
 * FR42a's thin-content signals for ONE project detail page.
 *
 * TAKES A `ProjectListItem`, DELIBERATELY. `ProjectDetail extends ProjectListItem`,
 * so the detail page passes its own object and the sitemap passes a row from its
 * single batched list read — same function, same verdict, and **no per-project
 * page read**. That avoids repeating the live per-industry N+1 the sitemap already
 * carries (and which React `cache()` cannot rescue, being inert in Route Handlers).
 *
 * The counted content is deliberately limited to fields BOTH shapes carry —
 * description, outcome, photos. Counting `products`, which only `ProjectDetail`
 * has, would make the page and the sitemap disagree about the same project: the
 * precise drift this module exists to prevent.
 *
 * `title` is NOT counted: it is NOT NULL in the schema and falls back to the slug,
 * so every project has one and it cannot distinguish a populated project from an
 * empty one.
 */
export function projectSignals(locale: Locale, project: ProjectListItem): ContentSignals {
  const contentCount =
    (project.description ? 1 : 0) + (project.outcome ? 1 : 0) + project.media.length;

  return {
    locale,
    itemCount: contentCount,
    fallbackFields: project.isFallback ? 1 : 0,
    totalFields: 1,
  };
}
