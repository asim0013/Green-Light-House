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

/**
 * Every category read takes an explicit ceiling (Story 2.2 — closes the row-cap
 * defer the 2.1 review aimed at this story). Far above the seeded 5; a catalogue
 * with more than 200 categories has outgrown this page design anyway.
 */
export const CATEGORY_READ_CAP = 200;

/** A category with its DIRECT published-product count (no child roll-up — Task 0). */
export interface CategoryCount extends CategoryListItem {
  publishedCount: number;
}

/** A node in the category tree: itself + its children, depth-agnostic. */
export interface CategoryTreeNode extends CategoryCount {
  children: CategoryTreeNode[];
}

/** One category view's worth of context: the node, its parent, its children. */
export interface CategoryDetail extends CategoryCount {
  parent: CategoryListItem | null;
  children: CategoryCount[];
}

/**
 * The minimum shape the tree assembler consumes — plain rows with a parent id,
 * so the assembly logic is unit-testable without Prisma.
 */
export interface FlatCategoryRow extends CategoryRow {
  parentId: string | null;
  publishedCount: number;
}

/**
 * Assemble a parent-linked flat list into a forest, DEPTH-AGNOSTIC even though
 * today's seed is exactly two levels. A row whose parentId matches no row in the
 * list (data corruption, or a cap that cut the parent) is promoted to a root
 * rather than silently dropped — an invisible category is worse than a
 * mis-nested one.
 *
 * SCOPE OF THAT PROMISE (2.2 review): it covers the MISSING-parent case only. A
 * parentId CYCLE (A→B→A) leaves its members parented to each other, reachable
 * from no root — they drop from the forest without crashing (flatten walks from
 * roots, so infinite recursion is impossible). Nothing prevents a cycle in the
 * schema, and nothing can create one until Epic 4 edits categories — which is
 * where cycle REJECTION belongs: on write, not on every read.
 */
export function assembleCategoryTree(
  rows: readonly FlatCategoryRow[],
  locale: Locale,
): CategoryTreeNode[] {
  const nodes = new Map<string, CategoryTreeNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      ...toCategoryListItem(row, locale),
      publishedCount: row.publishedCount,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id)!;
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * The whole category tree with per-node DIRECT published-product counts
 * (Story 2.2, FR13). One capped query + in-memory assembly, not a recursive
 * fetch — depth-agnostic and a single round trip.
 */
export async function listCategoryTree(locale: Locale): Promise<CategoryTreeNode[]> {
  // `catalog` AS WELL AS `categories` (2.2 review): the payload embeds per-node
  // published-product COUNTS, so a product publish/unpublish must invalidate it.
  // Tagged `categories` alone, an admin publish refreshed the grids instantly
  // while the chip counts lied for up to the 60s SWR window.
  return cached(
    () => queryCategoryTree(locale),
    ["category-tree", locale],
    [TAGS.categories, TAGS.catalog],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryCategoryTree(locale: Locale): Promise<CategoryTreeNode[]> {
  const categories = await prisma.category.findMany({
    include: {
      translations: true,
      // Filtered relation count — Prisma emits one query; `status: published`
      // keeps the count honest with what the grid will actually render.
      _count: { select: { products: { where: { status: "published" } } } },
    },
    orderBy: { slug: "asc" },
    take: CATEGORY_READ_CAP,
  });

  return assembleCategoryTree(
    categories.map((category) => ({
      id: category.id,
      slug: category.slug,
      parentId: category.parentId,
      translations: category.translations,
      publishedCount: category._count.products,
    })),
    locale,
  );
}

/**
 * One category by slug with its parent (for the breadcrumb trail) and children
 * (for the tiles), or `null` when it does not exist (Story 2.2).
 *
 * CACHE-KEY HONESTY (corrected by the 2.2 review — an earlier comment claimed the
 * page gate "bounds the key space", which it does not): the gate bounds the SHAPE
 * and LENGTH of what reaches this key. Malformed values never arrive and the
 * >247-char tag log-amplification class is dead — but CARDINALITY is unbounded:
 * every distinct valid-shaped unknown slug still mints one null entry per locale
 * at the handler TTL. Same exposure class as the 2.1-deferred `getProductBySlug`
 * item; both want the one existence-check fix tracked in deferred-work.md.
 */
export async function getCategoryBySlug(
  slug: string,
  locale: Locale,
): Promise<CategoryDetail | null> {
  return cached(
    () => queryCategoryBySlug(slug, locale),
    ["category", slug, locale],
    // `catalog` for the same reason as the tree: children carry published counts.
    [TAGS.categories, TAGS.catalog],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryCategoryBySlug(
  slug: string,
  locale: Locale,
): Promise<CategoryDetail | null> {
  const category = await prisma.category.findUnique({
    where: { slug },
    include: {
      translations: true,
      parent: { include: { translations: true } },
      children: {
        include: {
          translations: true,
          _count: { select: { products: { where: { status: "published" } } } },
        },
        orderBy: { slug: "asc" },
        take: CATEGORY_READ_CAP,
      },
      _count: { select: { products: { where: { status: "published" } } } },
    },
  });
  if (!category) return null;

  return {
    ...toCategoryListItem(category, locale),
    publishedCount: category._count.products,
    parent: category.parent ? toCategoryListItem(category.parent, locale) : null,
    children: category.children.map((child) => ({
      ...toCategoryListItem(child, locale),
      publishedCount: child._count.products,
    })),
  };
}

// ---- Writes (Story 4.3, admin CRUD) ---------------------------------------

export interface CategoryEditData {
  id: string;
  slug: string;
  parentId: string | null;
  translations: { locale: Locale; name: string }[];
}

/** Load one category's raw translations + parent for editing, or null if absent. */
export async function getCategoryForEdit(id: string): Promise<CategoryEditData | null> {
  const row = await prisma.category.findUnique({ where: { id }, include: { translations: true } });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    parentId: row.parentId,
    translations: row.translations.map((t) => ({ locale: t.locale, name: t.name })),
  };
}

/** All categories as {id, slug, name} for admin pickers (EN fallback, uncached — admin-only). */
export async function listCategoryOptions(
  locale: Locale,
): Promise<{ id: string; slug: string; name: string }[]> {
  const rows = await prisma.category.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });
  return rows.map((c) => {
    const t = resolveTranslation(c.translations, locale);
    return { id: c.id, slug: c.slug, name: t?.value.name ?? c.slug };
  });
}

export async function createCategory(data: {
  slug: string;
  parentId?: string;
  translations: { locale: Locale; name: string }[];
}): Promise<{ id: string; slug: string }> {
  return prisma.category.create({
    data: {
      slug: data.slug,
      parentId: data.parentId ?? null,
      translations: { create: data.translations.map((t) => ({ locale: t.locale, name: t.name })) },
    },
    select: { id: true, slug: true },
  });
}

/**
 * Would setting `proposedParentId` as the parent of `categoryId` create a cycle?
 * (`category.ts` reads deliberately do NOT check this — it belongs on write, here.)
 * Walks up from the proposed parent; a cycle exists if we reach `categoryId`.
 */
export async function wouldCreateCategoryCycle(
  categoryId: string,
  proposedParentId: string,
): Promise<boolean> {
  if (proposedParentId === categoryId) return true;
  const rows = await prisma.category.findMany({ select: { id: true, parentId: true } });
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  const seen = new Set<string>();
  let cursor: string | null | undefined = proposedParentId;
  while (cursor) {
    if (cursor === categoryId) return true;
    if (seen.has(cursor)) break; // guard against a pre-existing cycle in the data
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

/** Update a category's parent + replace its translations. Returns false if absent. */
export async function updateCategory(
  id: string,
  parentId: string | null,
  translations: { locale: Locale; name: string }[],
): Promise<boolean> {
  const exists = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.category.update({ where: { id }, data: { parentId } }),
    prisma.categoryTranslation.deleteMany({ where: { categoryId: id } }),
    prisma.categoryTranslation.createMany({
      data: translations.map((t) => ({ categoryId: id, locale: t.locale, name: t.name })),
    }),
  ]);
  return true;
}

/** How many rows would block a category delete (child categories + products). */
export async function categoryReferenceCounts(
  id: string,
): Promise<{ children: number; products: number }> {
  const [children, products] = await Promise.all([
    prisma.category.count({ where: { parentId: id } }),
    prisma.product.count({ where: { categoryId: id } }),
  ]);
  return { children, products };
}

/** Delete a category (translations cascade). Caller must check references first. */
export async function deleteCategory(id: string): Promise<void> {
  await prisma.category.delete({ where: { id } });
}
