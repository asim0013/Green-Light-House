import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { parseProjectMedia, type ProjectMediaEntry } from "@/lib/project-media";
import { resolveTranslation, DEFAULT_LOCALE } from "@/server/i18n/resolveTranslation";
import {
  toProductCardItem,
  CARD_INCLUDE,
  type ProductCardItem,
} from "@/server/repositories/product";

export interface ProjectListItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  outcome: string | null;
  /**
   * True when the TITLE fell back to EN — i.e. the requested locale has no
   * translation row at all.
   *
   * ⚠️ It does NOT cover the body fields. See `descriptionIsFallback` /
   * `outcomeIsFallback`: a row can exist for the requested locale while leaving
   * `description` or `outcome` NULL, and those fall back independently.
   */
  isFallback: boolean;
  /** True when `description` came from EN while the requested locale is not EN. */
  descriptionIsFallback: boolean;
  /** True when `outcome` came from EN while the requested locale is not EN. */
  outcomeIsFallback: boolean;
  /** Null when the project has no industry — `industry_id` is a nullable FK. */
  industry: { slug: string; name: string } | null;
  deliveredAt: Date | null;
  /**
   * Project photos in the frozen `ProjectMediaEntry` shape (Story 3.0), already
   * validated, sorted and de-duplicated.
   *
   * PARSED HERE, AT THE REPOSITORY BOUNDARY, AND ONCE (Story 3.1, AC9). The
   * mapper runs INSIDE the cached callback, so Redis stores the frozen shape
   * rather than raw JSONB and no consumer ever sees an unvalidated value. That
   * is what makes `project-media.ts`'s SVG rejection a real security boundary
   * instead of a convention: by render time the value has already been trusted
   * by whatever read it.
   *
   * Never cast to this type and never re-validate downstream.
   */
  media: ProjectMediaEntry[];
}

/**
 * The minimum structural shape `toProjectListItem` consumes. Deliberately narrower
 * than Prisma's row type so the mapper can be unit-tested with plain objects —
 * Prisma's richer rows remain assignable.
 */
export interface ProjectRow {
  id: string;
  slug: string;
  deliveredAt: Date | null;
  media: unknown;
  translations: readonly {
    locale: Locale;
    title: string;
    description: string | null;
    outcome: string | null;
  }[];
  industry: { slug: string; translations: readonly { locale: Locale; name: string }[] } | null;
}

/**
 * Resolve one project row for `locale` (EN fallback, FR34a).
 *
 * The project and its industry resolve INDEPENDENTLY: a project can be translated
 * while its industry is not. `isFallback` therefore reports the project's own text
 * only — that is what the "shown in English" marker sits next to.
 */
export function toProjectListItem(project: ProjectRow, locale: Locale): ProjectListItem {
  const t = resolveTranslation(project.translations, locale);
  const it = project.industry ? resolveTranslation(project.industry.translations, locale) : null;

  /**
   * PER-FIELD FALLBACK for the body text (Story 3.1, AC2b).
   *
   * `resolveTranslation` picks a ROW. A row can exist for the requested locale and
   * still leave `description` or `outcome` NULL — which is the actual seeded state
   * of the LNG project's `tr` row — and the field then vanished with
   * `isFallback: false`: no `lang`, no visible notice, and an `itemCount` of zero
   * that pushed the page to `noindex` for a reason nothing surfaced.
   *
   * Resolved here rather than inside `resolveTranslation`, which nine repositories
   * share and which is correct as a row-level primitive. This is the same
   * per-field treatment `ProductCardItem` already gives a manufacturer's name.
   */
  const en = project.translations.find((row) => row.locale === DEFAULT_LOCALE) ?? null;
  function field(pick: (row: (typeof project.translations)[number]) => string | null) {
    const own = t ? pick(t.value) : null;
    if (own !== null) return { value: own, isFallback: t?.isFallback ?? false };

    const fromEn = en ? pick(en) : null;
    // Absent everywhere is not a fallback — it is simply absent, and the renderer
    // omits the row rather than marking it.
    if (fromEn === null) return { value: null, isFallback: false };
    return { value: fromEn, isFallback: locale !== DEFAULT_LOCALE };
  }

  const description = field((row) => row.description);
  const outcome = field((row) => row.outcome);

  return {
    id: project.id,
    slug: project.slug,
    title: t?.value.title ?? project.slug,
    description: description.value,
    outcome: outcome.value,
    isFallback: t?.isFallback ?? false,
    descriptionIsFallback: description.isFallback,
    outcomeIsFallback: outcome.isFallback,
    industry: project.industry
      ? { slug: project.industry.slug, name: it?.value.name ?? project.industry.slug }
      : null,
    deliveredAt: project.deliveredAt,
    media: parseProjectMedia(project.media),
  };
}

/**
 * List published projects, newest delivered first, with names resolved for
 * `locale`. Data access lives here, never in components/routes (CLAUDE.md).
 *
 * Two things this MUST get right:
 *  - `status` defaults to `draft`, so an unfiltered read would leak unpublished work.
 *  - `delivered_at` is nullable and Postgres sorts NULLS FIRST on DESC, which would
 *    rank an undated project above a dated one. `nulls: "last"` pins undated rows to
 *    the bottom; `slug` breaks the remaining ties so the order is deterministic.
 */
export async function listPublishedProjects(
  locale: Locale,
  limit?: number,
): Promise<ProjectListItem[]> {
  // `limit` changes the result, so it belongs in the key alongside the locale.
  const rows = await cached(
    () => queryPublishedProjects(locale, limit),
    ["projects", locale, String(limit ?? "all")],
    [TAGS.projects],
  );

  return rehydrateDates(rows);
}

/**
 * Published projects delivered into `industrySlug`, for the Delivered-projects
 * block (Story 2.1). Same ordering, same mapper, same date contract as the
 * unfiltered list — only the `where` narrows.
 */
export async function listProjectsByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<ProjectListItem[]> {
  const rows = await cached(
    () => queryPublishedProjects(locale, limit, industrySlug),
    ["projects-by-industry", industrySlug, locale, String(limit ?? "all")],
    [TAGS.projects, TAGS.industry(industrySlug)],
  );

  return rehydrateDates(rows);
}

/**
 * Re-hydrate `deliveredAt`. The cache round-trips values through JSON, so a `Date`
 * comes back as an ISO STRING — and `format.dateTime` given a string renders the
 * raw "2024-06-01T00:00:00.000Z" instead of "June 2024". Applied unconditionally
 * because it is also correct on a cache miss, where the value is still a real Date.
 *
 * Shared by every cached project read: the bug is silent (a date that renders as a
 * timestamp, not a crash), so a second read that forgot this would ship unnoticed.
 */
function rehydrateDates(rows: readonly ProjectListItem[]): ProjectListItem[] {
  return rows.map((row) => ({
    ...row,
    deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : null,
  }));
}

/** One project as its detail page renders it: the list shape plus supplied equipment. */
export interface ProjectDetail extends ProjectListItem {
  /**
   * The linked catalog products (`ProjectProduct`), as Product Cards.
   *
   * NO EXISTING READ FETCHES THESE — `queryPublishedProjects` never included
   * `products`, so this is the first. Mapped with the shared `toProductCardItem`
   * so a card on a project page cannot drift from a card in the catalog.
   *
   * ⚠️ Story 3.1b owns the per-line QUANTITIES and the free-text BOM rows the
   * design calls for. `ProjectProduct` is a bare two-column join today, so this
   * is "equipment supplied", not a bill of materials.
   */
  products: ProductCardItem[];
}

/**
 * Fetch one published project by slug, resolved for `locale`. Null when the slug
 * does not exist OR the project is not published.
 *
 * SLUG-KEYED THROUGHOUT, DELIBERATELY (Story 3.1, AC7). `getProductBySlug` runs a
 * slug→id hop because `TAGS.product` is keyed by ID: the per-entity tag cannot be
 * applied until the id is known, and `unstable_cache` fixes tags when the wrapper
 * is BUILT. `TAGS.project` is keyed by SLUG, so that machinery solves a problem
 * projects do not have — the tag is available up front. Keying and querying by the
 * same slug the tag names also satisfies `cache.ts`'s rule that an entry's inputs
 * must match its key, which is what the 2.4 review found violated for products
 * (an id-keyed entry queried by the caller's slug let one slug poison another's
 * read after a rename).
 *
 * A CACHED NULL IS STILL NEVER TRUSTED. Here the slug-keyed tag already means an
 * admin's `project:<slug>` purge reaches a null minted while the project was
 * draft — unlike the product case, where the null was tagged `catalog` only and
 * survived the purge. The fallthrough below is kept anyway, because it makes a
 * publish take effect on the NEXT REQUEST with no purge at all, and the only
 * slugs paying the extra query are ones that do not resolve.
 *
 * BOTH TAGS (AC6/AC7b). `project:<slug>` purges this entry; `projects` is carried
 * so a collection-wide invalidation still reaches detail pages. Note the converse
 * does NOT hold: `project:<slug>` alone cannot reach the LIST reads above, so an
 * admin renaming a project must send `projects` too or the homepage hero and the
 * industry page stay stale.
 */
export async function getProjectBySlug(
  slug: string,
  locale: Locale,
): Promise<ProjectDetail | null> {
  const hit = await cached(
    () => queryProjectBySlug(slug, locale),
    ["project", slug, locale],
    [TAGS.project(slug), TAGS.projects],
  );

  const project = hit ?? (await queryProjectBySlug(slug, locale));
  return project ? rehydrateDetailDates(project) : null;
}

/**
 * Re-hydrate `deliveredAt` on a single project — the detail-read counterpart of
 * `rehydrateDates`. See that function: the cache is a JSON boundary and a `Date`
 * comes back as an ISO STRING, which `format.dateTime` renders as a raw
 * timestamp. The bug is silent, which is why every cached read needs this.
 */
function rehydrateDetailDates(project: ProjectDetail): ProjectDetail {
  return {
    ...project,
    deliveredAt: project.deliveredAt ? new Date(project.deliveredAt) : null,
  };
}

/**
 * Uncached SQL read for one project. Exported for integration tests — see the
 * note in `@/lib/cache`.
 *
 * `status: "published"` is not optional: without it an unpublished project would
 * be readable by anyone who guessed its slug.
 */
export async function queryProjectBySlug(
  slug: string,
  locale: Locale,
): Promise<ProjectDetail | null> {
  const project = await prisma.project.findFirst({
    where: { slug, status: "published" },
    include: {
      translations: true,
      industry: { include: { translations: true } },
      products: { include: { product: { include: CARD_INCLUDE } }, orderBy: { productId: "asc" } },
    },
  });

  if (!project) return null;

  return {
    ...toProjectListItem(project, locale),
    products: project.products.map((link) => toProductCardItem(link.product, locale)),
  };
}

/**
 * Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`.
 *
 * `industrySlug` narrows to one industry via the nullable `industry_id` FK; omitted,
 * the read is the whole published set. It is the LAST parameter so that Story 1.7's
 * existing call sites keep working unchanged.
 */
export async function queryPublishedProjects(
  locale: Locale,
  limit?: number,
  industrySlug?: string,
): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    where: {
      status: "published",
      ...(industrySlug ? { industry: { slug: industrySlug } } : {}),
    },
    include: { translations: true, industry: { include: { translations: true } } },
    orderBy: [{ deliveredAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
    take: limit,
  });

  return projects.map((project) => toProjectListItem(project, locale));
}
