import { prisma } from "@/lib/db";

/**
 * FK slug → id resolution for the bulk product import (Story 4.10). Import rows
 * reference manufacturer/category/series/industry by SLUG (human-authored audit
 * data); the write path needs ids. These BATCH the lookups — one query per entity
 * across every referenced slug — so a large import does not do N per-row reads.
 * An unknown slug simply won't be in the returned map, and the processor turns
 * that into a row-level error (parents are curated via the 4.3 CRUD, not created
 * here — Story 4.10 Decision 0).
 */

async function idsBySlug(
  find: (slugs: string[]) => Promise<{ id: string; slug: string }[]>,
  slugs: Iterable<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set([...slugs].filter(Boolean))];
  if (unique.length === 0) return new Map();
  const rows = await find(unique);
  return new Map(rows.map((r) => [r.slug, r.id]));
}

export function manufacturerIdsBySlug(slugs: Iterable<string>): Promise<Map<string, string>> {
  return idsBySlug(
    (s) => prisma.manufacturer.findMany({ where: { slug: { in: s } }, select: { id: true, slug: true } }),
    slugs,
  );
}

export function categoryIdsBySlug(slugs: Iterable<string>): Promise<Map<string, string>> {
  return idsBySlug(
    (s) => prisma.category.findMany({ where: { slug: { in: s } }, select: { id: true, slug: true } }),
    slugs,
  );
}

export function seriesIdsBySlug(slugs: Iterable<string>): Promise<Map<string, string>> {
  return idsBySlug(
    (s) => prisma.series.findMany({ where: { slug: { in: s } }, select: { id: true, slug: true } }),
    slugs,
  );
}

export function industryIdsBySlug(slugs: Iterable<string>): Promise<Map<string, string>> {
  return idsBySlug(
    (s) => prisma.industry.findMany({ where: { slug: { in: s } }, select: { id: true, slug: true } }),
    slugs,
  );
}
