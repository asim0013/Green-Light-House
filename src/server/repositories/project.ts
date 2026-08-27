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
import type { CategoryRow } from "@/server/repositories/category";

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
  /**
   * Null when the project has no industry — `industry_id` is a nullable FK.
   *
   * `isFallback` covers the NAME (3.1 review): the industry resolves its own
   * translation independently of the project's, so a Russian page can show a
   * fallen-back English "Fire Safety" beside a marked Russian title — and the
   * name needs its own flag or no consumer can `lang`-mark it. `name` is
   * guaranteed non-empty: a blank or missing translation falls back to the slug.
   */
  industry: { slug: string; name: string; isFallback: boolean } | null;
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
    // "" is treated as ABSENT, not as content (3.1 review). No current writer can
    // produce it — the seed writes null — but Epic 4's admin will, and a blanked
    // field must fall back exactly like a missing one rather than silently
    // deleting the EN text behind an empty string.
    const own = t ? pick(t.value) : null;
    if (own !== null && own !== "") return { value: own, isFallback: t?.isFallback ?? false };

    const fromEn = en ? pick(en) : null;
    // Absent everywhere is not a fallback — it is simply absent, and the renderer
    // omits the row rather than marking it.
    if (fromEn === null || fromEn === "") return { value: null, isFallback: false };
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
      ? {
          slug: project.industry.slug,
          // Trim-or-slug: a present-but-blank translated name must not become an
          // empty group heading or a dangling chip separator (3.1 review).
          name: it?.value.name.trim() || project.industry.slug,
          isFallback: it?.isFallback ?? false,
        }
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
      products: {
        // ⚠️ THE STATUS FILTER IS LOAD-BEARING (3.1 review, proven live with a
        // probe row). Without it a DRAFT product linked via `ProjectProduct`
        // rendered its name, model and card on a published project's page.
        // `CARD_INCLUDE` cannot carry this filter — it is a `Prisma.ProductInclude`
        // and filters the product's RELATIONS, never the product itself — and
        // `ProductCardRow` discards `status` at the type boundary, so this `where`
        // on the join rows is the only place the guard can live. Every other
        // card-producing read filters `status: "published"` in its own where;
        // `Product.status` defaults to `draft`, so an unpublish must remove the
        // card here, not leave it leaking.
        where: { product: { status: "published" } },
        include: { product: { include: CARD_INCLUDE } },
        orderBy: { productId: "asc" },
      },
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

/**
 * The `?project=` DOORWAY READ (Story 3.4, AC1) — uncached.
 *
 * Returns exactly what the pre-fill needs and nothing else: the project's
 * industry, and the DISTINCT categories of the products linked to it. No shipped
 * read could supply this — `ProjectDetail.products` is `ProductCardItem[]` and
 * `CARD_INCLUDE` carries no category at all, so the detail page cannot derive
 * it. Widening `CARD_INCLUDE` would touch every card-producing surface on the
 * site; a dedicated projection costs one indexed query.
 *
 * ⚠️ THE STATUS FILTER IS THE SAME LOAD-BEARING GUARD AS `queryProjectBySlug`'s,
 * and for the same reason (3.1 review, proven live): it must sit in a `where` on
 * the JOIN ROWS. A `ProductInclude` filters the product's RELATIONS, never the
 * product itself — so without this, a doorway URL would disclose the CATEGORY of
 * an unpublished product. That is a narrower leak than 3.1's (a category name,
 * not a card) but it is the same class, and it reaches the buyer's own inbox via
 * the RFQ email.
 *
 * ⚠️ UNCACHED, DELIBERATELY. `/rfq` accepts up to four attacker-controlled slugs
 * on ONE URL, and precedence decides `Lead.source` only — every present param
 * still has to resolve for `prefillContext`. Caching per-slug would make this the
 * cheapest cache-cardinality amplifier on the site. `/rfq` is already
 * `force-dynamic`, so an uncached read costs one query and buys a fixed key
 * space. If this is ever cached, it MUST carry all four of `TAGS.project(slug)`,
 * `TAGS.projects`, `TAGS.catalog` and `TAGS.categories` — the payload holds
 * category names AND depends on product status (the 2.2 lesson).
 */
export async function queryProjectPrefill(
  slug: string,
  locale: Locale,
): Promise<ProjectPrefill | null> {
  const project = await prisma.project.findFirst({
    where: { slug, status: "published" },
    select: {
      slug: true,
      industry: { select: { slug: true, translations: { select: { locale: true, name: true } } } },
      products: {
        where: { product: { status: "published" } },
        select: {
          product: {
            select: {
              category: {
                select: { id: true, slug: true, translations: { select: { locale: true, name: true } } },
              },
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  return {
    slug: project.slug,
    industry: project.industry
      ? {
          slug: project.industry.slug,
          ...pickName(project.industry.translations, project.industry.slug, locale),
        }
      : null,
    categories: distinctCategories(
      project.products.map((link) => link.product.category),
      locale,
    ),
  };
}

export interface PrefillName {
  slug: string;
  name: string;
  /** True when the name fell back to EN (FR34a / UX-DR21 — the banner marks it). */
  isFallback: boolean;
}

export interface ProjectPrefill {
  slug: string;
  industry: PrefillName | null;
  categories: PrefillName[];
}

/** Resolve one row's display name, degrading to the slug (the shipped rule —
 *  `toCategoryListItem` and `toIndustryListItem` both do exactly this). */
function pickName(
  translations: readonly { locale: Locale; name: string }[],
  slug: string,
  locale: Locale,
): { name: string; isFallback: boolean } {
  const t = resolveTranslation(translations, locale);
  return { name: t?.value.name ?? slug, isFallback: t?.isFallback ?? false };
}

/**
 * De-duplicate by SLUG and order deterministically.
 *
 * ⚠️ NEVER ROLL UP TO THE PARENT. The one seeded project that yields chips
 * (`lng-terminal-fire-gas-upgrade`) produces `fire-gas-detection` AND its own
 * child `flame-detectors`. Collapsing to the parent would silently drop the more
 * specific category — the one the buyer actually needs — and it would contradict
 * two shipped precedents: `listCategoriesByIndustry` does not roll up
 * (`category.ts:34-38`) and the catalogue's direct-attachment doctrine
 * (`product.ts:359-366`). Both are emitted; only exact duplicates collapse.
 *
 * ORDER IS BY SLUG, not by the join's `productId`. The shipped join order is
 * arbitrary cuid order, which would let the banner's text change between two
 * identical requests.
 *
 * Exported for its own unit test: proving the dedupe through the seed is
 * impossible (LNG's two products are already in two different categories, so
 * removing the dedupe changes nothing observable there).
 */
export function distinctCategories(
  rows: readonly (CategoryRow | null)[],
  locale: Locale,
): PrefillName[] {
  const bySlug = new Map<string, PrefillName>();
  for (const row of rows) {
    // A product's category is nullable in the schema; a link to an uncategorised
    // product contributes no chip rather than an empty one.
    if (!row || bySlug.has(row.slug)) continue;
    bySlug.set(row.slug, { slug: row.slug, ...pickName(row.translations, row.slug, locale) });
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}
