import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface CategoryListItem {
  id: string;
  slug: string;
  name: string;
  /** True when the name fell back to EN. */
  isFallback: boolean;
}

/**
 * List TOP-LEVEL categories only (`parent_id IS NULL`), resolved for `locale`.
 *
 * Categories are self-referencing and hierarchical: the seed's `flame-detectors`
 * is a child of `fire-gas-detection`, so an unfiltered read would list a child
 * alongside its own parent as a peer signpost. Child browse is Epic 2's job.
 */
export async function listTopLevelCategories(locale: Locale): Promise<CategoryListItem[]> {
  return cached(() => queryTopLevelCategories(locale), ["categories", locale], [TAGS.categories]);
}

/**
 * The equipment categories actually supplied into `industrySlug`, for the
 * "What we supply" block (Story 2.1).
 *
 * There is NO Category↔Industry relation in the schema; the link runs through
 * products. So this answers "which categories does GLH supply into this sector",
 * derived from the published catalogue rather than declared separately — which
 * also means it can never advertise a category with nothing behind it.
 *
 * Unlike `listTopLevelCategories` this does NOT filter to `parent_id IS NULL`: the
 * useful answer here is the specific categories the products sit in (e.g.
 * `flame-detectors`), not their top-level parents.
 */
export async function listCategoriesByIndustry(
  industrySlug: string,
  locale: Locale,
): Promise<CategoryListItem[]> {
  return cached(
    () => queryCategoriesByIndustry(industrySlug, locale),
    ["categories-by-industry", industrySlug, locale],
    [TAGS.categories, TAGS.catalog, TAGS.industry(industrySlug)],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryCategoriesByIndustry(
  industrySlug: string,
  locale: Locale,
): Promise<CategoryListItem[]> {
  const categories = await prisma.category.findMany({
    where: {
      products: {
        some: {
          status: "published",
          industries: { some: { industry: { slug: industrySlug } } },
        },
      },
    },
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return categories.map((category) => toCategoryListItem(category, locale));
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryTopLevelCategories(locale: Locale): Promise<CategoryListItem[]> {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return categories.map((category) => toCategoryListItem(category, locale));
}

/**
 * The minimum structural shape `toCategoryListItem` consumes — narrower than
 * Prisma's row type so the mapper is unit-testable with plain objects.
 */
export interface CategoryRow {
  id: string;
  slug: string;
  translations: readonly { locale: Locale; name: string }[];
}

/** Resolve one category row for `locale` (EN fallback, FR34a). */
export function toCategoryListItem(category: CategoryRow, locale: Locale): CategoryListItem {
  const t = resolveTranslation(category.translations, locale);
  return {
    id: category.id,
    slug: category.slug,
    name: t?.value.name ?? category.slug,
    isFallback: t?.isFallback ?? false,
  };
}
