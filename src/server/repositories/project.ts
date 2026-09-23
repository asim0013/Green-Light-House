import { Prisma, type Locale } from "@prisma/client";
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
   * The facts card's SCOPE row (Story 3.1b) — a short capability phrase, NOT the
   * narrative. `description` remains the body. Null ⇒ the row is omitted.
   */
  scope: string | null;
  scopeIsFallback: boolean;
  /** The facts card's LOCATION row. Translated: place names differ per locale. */
  location: string | null;
  locationIsFallback: boolean;
  /**
   * The facts card's LEAD TIME row, in weeks. An INTEGER rendered through an ICU
   * plural — never prose. The canvas writes it "six weeks" in one place and
   * "6 wk" in another, and no locale can derive a spelled-out numeral from an
   * integer (`Intl` has no spell-out), so storing the rendered string would
   * reintroduce exactly the number drift FR30 spent Story 3.5 eliminating.
   */
  leadTimeWeeks: number | null;
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
  /** Facts-card LEAD TIME (Story 3.1b). Scalar on the project, not translated. */
  leadTimeWeeks: number | null;
  media: unknown;
  translations: readonly {
    locale: Locale;
    title: string;
    description: string | null;
    outcome: string | null;
    /** Facts-card SCOPE (Story 3.1b) — the capability phrase, not the narrative. */
    scope: string | null;
    /** Facts-card LOCATION (Story 3.1b) — translated; place names differ. */
    location: string | null;
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
  // Story 3.1b's facts rows. Same per-field treatment as the body text above:
  // a locale row can exist and still leave these null, and an absent value must
  // omit its row rather than render a bare label (the defect the 3.5 review
  // found on six surfaces).
  const scope = field((row) => row.scope);
  const location = field((row) => row.location);

  return {
    id: project.id,
    slug: project.slug,
    title: t?.value.title ?? project.slug,
    description: description.value,
    outcome: outcome.value,
    isFallback: t?.isFallback ?? false,
    descriptionIsFallback: description.isFallback,
    outcomeIsFallback: outcome.isFallback,
    scope: scope.value,
    scopeIsFallback: scope.isFallback,
    location: location.value,
    locationIsFallback: location.isFallback,
    leadTimeWeeks: project.leadTimeWeeks,
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

/**
 * One line of the scope-of-supply BOM (Story 3.1b, AC2).
 *
 * ⚠️ EVERY FIELD BUT `manufacturer` IS SELF-SUFFICIENT. `model` is stored on the
 * line and `label` comes from the line's own translation — NOT from the linked
 * product's category, which was counted and matches zero of the five designed
 * rows. `manufacturer` is the one value the join supplies, and it is `null`
 * whenever there is no PUBLISHED product behind the line, which the table renders
 * as an em-dash.
 */
export interface ProjectBomLineItem {
  id: string;
  /** The CATEGORY column — authored per line, translated. */
  label: string;
  labelIsFallback: boolean;
  /** The MODEL column — always present, never derived from the join. */
  model: string;
  /** The MANUFACTURER column. `null` ⇒ no published product ⇒ em-dash. */
  manufacturer: string | null;
  quantity: number;
}

/** One project as its detail page renders it: the list shape plus its BOM. */
export interface ProjectDetail extends ProjectListItem {
  /**
   * The equipment CARDS — the subset of `bomLines` backed by a PUBLISHED catalog
   * product, mapped with the shared `toProductCardItem` so a card on a project
   * page cannot drift from a card in the catalog.
   *
   * ⛔ THIS IS A STRICTER FILTER THAN THE BOM'S. A draft or absent product yields
   * a BOM LINE (its own model, em-dash manufacturer) but NO CARD — an em-dash
   * card is not a card, and `repository.integration.test.ts` proves live that a
   * draft product must never render its name, model or card here.
   *
   * ⚠️ NOT capped here. The equipment row's 3-card cap is applied at RENDER; a
   * `take:` in the read would truncate the BOM table too and falsify its derived
   * footer.
   */
  products: ProductCardItem[];
  /** The full bill of materials, in `sortOrder`. Every line, unfiltered. */
  bomLines: ProjectBomLineItem[];
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
      bomLines: {
        // ⛔ NO `where` ON THIS RELATION, AND THAT IS THE WHOLE DESIGN.
        //
        // The 3.1 review's guard lived here as `where: { product: { status:
        // "published" } }`, which was correct while `productId` was NOT NULL.
        // It is now nullable, and that shorthand STILL TYPECHECKS: Prisma binds
        // the bare object to the `ProductWhereInput` arm of the XOR and treats
        // it as `is:`, an INNER JOIN — so a `product_id IS NULL` row is silently
        // dropped. The BOM's designed non-catalog line ("Clean-agent suppression
        // skid") would vanish and the derived footer would render "4 line items
        // / 314 units" instead of 5 / 317, with no error and no failing test.
        //
        // The guard has NOT been weakened; it MOVED to the mapper, which needs
        // three different rules for three consumers anyway (see below).
        include: {
          translations: true,
          product: { include: CARD_INCLUDE },
        },
        // `id` tiebreaker: `sortOrder` is non-unique and defaults to 0, so a
        // tie would otherwise leave BOM row order — and which products get
        // capped out of the equipment row — nondeterministic across reads.
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      },
    },
  });

  if (!project) return null;

  const en = DEFAULT_LOCALE;

  return {
    ...toProjectListItem(project, locale),
    /**
     * RULE 1 — the equipment CARDS exclude anything without a PUBLISHED product.
     * This is the guard that used to live in the query's `where`, unchanged in
     * effect: a draft or absent product produces no card.
     */
    products: (() => {
      // A product may legitimately appear on more than one BOM line; the card
      // row shows each product ONCE (first line wins, preserving sortOrder). The
      // BOM table below still lists every physical line.
      const seen = new Set<string>();
      return project.bomLines
        .filter((line) => line.product !== null && line.product.status === "published")
        .filter((line) => {
          if (seen.has(line.product!.id)) return false;
          seen.add(line.product!.id);
          return true;
        })
        .map((line) => toProductCardItem(line.product!, locale));
    })(),
    /**
     * RULE 2 — every BOM line renders, whatever its product is doing. The line's
     * own `model` and translated `label` carry it; only `manufacturer` depends on
     * the join, and it is null (⇒ em-dash) for a draft or absent product, so no
     * unpublished product's identity ever reaches the page.
     */
    bomLines: project.bomLines.map((line) => {
      const own = line.translations.find((row) => row.locale === locale) ?? null;
      const fallback = line.translations.find((row) => row.locale === en) ?? null;
      const label = own?.label && own.label !== "" ? own : fallback;
      const published = line.product !== null && line.product.status === "published";
      return {
        id: line.id,
        label: label?.label ?? line.model,
        labelIsFallback: label !== null && label === fallback && locale !== en,
        model: line.model,
        // Resolved through `resolveTranslation` like every other manufacturer
        // name on the site — the name is translated, not a scalar — and falling
        // back to the slug the way `toProductCardItem` does, so the column can
        // never render empty for a published product.
        manufacturer: published
          ? (resolveTranslation(line.product!.manufacturer.translations, locale)?.value.name ??
            line.product!.manufacturer.slug)
          : null,
        quantity: line.quantity,
      };
    }),
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
 * site; a dedicated projection is the cheaper blast radius.
 *
 * ⚠️ NOT "one indexed query", which is what this said before the 3.4 review.
 * Prisma issues a statement per relation level for a nested select, so this is
 * several — the argument for a dedicated read is the blast radius it avoids,
 * never the statement count.
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
      bomLines: {
        // ⛔ SAME TRAP AS THE DETAIL READ — the relation is nullable now, so the
        // `where: { product: { … } }` shorthand would INNER JOIN and quietly drop
        // the non-catalog lines. Filtered at the mapper instead (RULE 3), which
        // also keeps the draft guard this read has a live probe for.
        select: {
          product: {
            select: {
              status: true,
              category: {
                select: {
                  id: true,
                  slug: true,
                  translations: { select: { locale: true, name: true } },
                },
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
    /**
     * RULE 3 — the RFQ doorway offers a chip only for a PUBLISHED product's
     * category. `?.` is mandatory, not stylistic: a non-catalog BOM line has no
     * product at all and `link.product.category` would be a hard TypeError on a
     * public route reachable from every project page.
     */
    categories: distinctCategories(
      project.bomLines
        .filter((line) => line.product?.status === "published")
        .map((line) => line.product!.category),
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
    // ⚠️ `Product.category` IS NOT NULLABLE — this comment used to claim it was
    // (3.4 review). `prisma/schema.prisma` declares `categoryId String` with a
    // required relation, so the `!row` arm is unreachable through the shipped
    // query and cannot be exercised by any fixture. It is kept as a defensive
    // narrow for the `CategoryRow | null` the select's type admits, NOT because
    // an uncategorised product exists. `bySlug.has` is the arm that does work.
    if (!row || bySlug.has(row.slug)) continue;
    bySlug.set(row.slug, { slug: row.slug, ...pickName(row.translations, row.slug, locale) });
  }
  return [...bySlug.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

// ---- Writes (Story 4.4, admin CRUD) ---------------------------------------

export interface ProjectTranslationWrite {
  locale: Locale;
  title: string;
  description: string | null;
  outcome: string | null;
  scope: string | null;
  location: string | null;
}

export interface ProjectScalars {
  industryId?: string | null;
  status: "draft" | "published";
  deliveredAt?: Date | null;
  leadTimeWeeks?: number | null;
  /**
   * The project's media (Story 4.5) — a frozen `ProjectMediaEntry[]` (with an
   * additive `sourceAssetId`), built by the copy-on-attach helper. When provided
   * it REPLACES `Project.media`; omit (undefined) to leave it untouched.
   */
  media?: ProjectMediaEntry[];
}

export interface ProjectEditData {
  id: string;
  slug: string;
  industryId: string | null;
  status: "draft" | "published";
  /** yyyy-mm-dd for the date input, or "" when unset. */
  deliveredAt: string;
  leadTimeWeeks: number | null;
  /** Source media-library asset id (from the attached entry's `sourceAssetId`), or null. */
  mediaAssetId: string | null;
  translations: ProjectTranslationWrite[];
}

export interface AdminProjectRow {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
}

/** All projects for the admin list — ALL statuses, uncached (admin sees drafts). */
export async function listProjectsForAdmin(locale: Locale): Promise<AdminProjectRow[]> {
  const rows = await prisma.project.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: resolveTranslation(p.translations, locale)?.value.title ?? p.slug,
    status: p.status,
  }));
}

/** Resolve industry ids to their slugs (drops nulls/misses, dedups) — for purge sets. */
async function industrySlugs(ids: (string | null | undefined)[]): Promise<string[]> {
  const wanted = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (wanted.length === 0) return [];
  const rows = await prisma.industry.findMany({
    where: { id: { in: wanted } },
    select: { slug: true },
  });
  return rows.map((r) => r.slug);
}

/** The source library asset id carried on the (single) attached media entry, or null. */
function mediaAssetIdOf(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  const first = media[0] as { sourceAssetId?: unknown } | undefined;
  return first && typeof first.sourceAssetId === "string" ? first.sourceAssetId : null;
}

/** Load one project's editable fields + raw translations, or null if absent. */
export async function getProjectForEdit(id: string): Promise<ProjectEditData | null> {
  const row = await prisma.project.findUnique({ where: { id }, include: { translations: true } });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    industryId: row.industryId,
    status: row.status,
    deliveredAt: row.deliveredAt ? row.deliveredAt.toISOString().slice(0, 10) : "",
    leadTimeWeeks: row.leadTimeWeeks,
    mediaAssetId: mediaAssetIdOf(row.media),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      title: t.title,
      description: t.description,
      outcome: t.outcome,
      scope: t.scope,
      location: t.location,
    })),
  };
}

/** Create a project (media defaults to []; Story 4.5 owns media). Returns the industry slug to bust. */
export async function createProject(
  data: ProjectScalars & { slug: string; translations: ProjectTranslationWrite[] },
): Promise<{ id: string; slug: string; industrySlugs: string[] }> {
  const created = await prisma.project.create({
    data: {
      slug: data.slug,
      industryId: data.industryId ?? null,
      status: data.status,
      deliveredAt: data.deliveredAt ?? null,
      leadTimeWeeks: data.leadTimeWeeks ?? null,
      media: (data.media ?? []) as unknown as Prisma.InputJsonValue,
      translations: {
        create: data.translations.map((t) => ({
          locale: t.locale,
          title: t.title,
          description: t.description,
          outcome: t.outcome,
          scope: t.scope,
          location: t.location,
        })),
      },
    },
    select: { id: true, slug: true },
  });
  return { ...created, industrySlugs: await industrySlugs([data.industryId]) };
}

/**
 * Update a project's scalars + replace its translations. `media` and `bomLines`
 * are untouched (Story 4.5 / a later story). Returns the industry slugs to bust
 * (old + new). `ok: false` if the project is gone.
 */
export async function updateProject(
  id: string,
  scalars: ProjectScalars,
  translations: ProjectTranslationWrite[],
): Promise<{ ok: boolean; slug: string | null; industrySlugs: string[] }> {
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { slug: true, industryId: true },
  });
  if (!existing) return { ok: false, slug: null, industrySlugs: [] };
  await prisma.$transaction([
    prisma.project.update({
      where: { id },
      data: {
        industryId: scalars.industryId ?? null,
        status: scalars.status,
        deliveredAt: scalars.deliveredAt ?? null,
        leadTimeWeeks: scalars.leadTimeWeeks ?? null,
        // Provided → replace; omitted → leave the existing media untouched.
        ...(scalars.media !== undefined
          ? { media: scalars.media as unknown as Prisma.InputJsonValue }
          : {}),
      },
    }),
    prisma.projectTranslation.deleteMany({ where: { projectId: id } }),
    prisma.projectTranslation.createMany({
      data: translations.map((t) => ({
        projectId: id,
        locale: t.locale,
        title: t.title,
        description: t.description,
        outcome: t.outcome,
        scope: t.scope,
        location: t.location,
      })),
    }),
  ]);
  return {
    ok: true,
    slug: existing.slug,
    industrySlugs: await industrySlugs([existing.industryId, scalars.industryId]),
  };
}

/** Delete a project (owned BOM lines + translations cascade). Returns the slug +
 *  industry slug to bust; a no-op (null slug) if it was already gone. */
export async function deleteProject(
  id: string,
): Promise<{ slug: string | null; industrySlugs: string[] }> {
  const existing = await prisma.project.findUnique({
    where: { id },
    select: { slug: true, industryId: true },
  });
  if (!existing) return { slug: null, industrySlugs: [] };
  const slugs = await industrySlugs([existing.industryId]);
  await prisma.project.delete({ where: { id } });
  return { slug: existing.slug, industrySlugs: slugs };
}
