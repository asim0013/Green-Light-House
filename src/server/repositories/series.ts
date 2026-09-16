import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface SeriesOption {
  slug: string;
  name: string;
  /** True when the name fell back to EN. */
  isFallback: boolean;
}

/**
 * The series filter's option row (Story 2.5 — FR17 names series as one of the
 * three facets). Only series that actually contain a PUBLISHED product appear:
 * a filter chip that can only ever produce an empty grid is a dead end, and the
 * seed's single series (`flameguard`) is the fixture either way.
 *
 * Cached under `catalog` — series membership changes with catalogue edits, and
 * the row carries no document data (no `documents` tag needed, unlike the six
 * card reads).
 */
export async function listSeriesOptions(locale: Locale): Promise<SeriesOption[]> {
  return cached(() => querySeriesOptions(locale), ["series-options", locale], [TAGS.catalog]);
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function querySeriesOptions(locale: Locale): Promise<SeriesOption[]> {
  const series = await prisma.series.findMany({
    where: { products: { some: { status: "published" } } },
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return series.map((row) => {
    const t = resolveTranslation(row.translations, locale);
    return {
      slug: row.slug,
      name: t?.value.name ?? row.slug,
      isFallback: t?.isFallback ?? false,
    };
  });
}

export interface ManufacturerOption {
  slug: string;
  name: string;
}

/**
 * The manufacturer filter's option row (Story 2.5, corrected in its review).
 *
 * Story 2.5 reused `listManufacturers`, which returns EVERY manufacturer
 * unconditionally — so the facet could offer a chip whose only possible result is
 * an empty grid, the exact dead-end the series facet beside it was written to
 * avoid. `listManufacturers` itself is left alone: the sitemap's collection
 * signals count it and must keep counting every row.
 *
 * Brand names are not translated prose, so no fallback flag travels with them
 * (the chips would otherwise append "shown in English" to four brand names on
 * every non-EN view).
 */
export async function listManufacturerOptions(locale: Locale): Promise<ManufacturerOption[]> {
  return cached(
    () => queryManufacturerOptions(locale),
    ["manufacturer-options", locale],
    [TAGS.catalog, TAGS.manufacturers],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryManufacturerOptions(locale: Locale): Promise<ManufacturerOption[]> {
  const rows = await prisma.manufacturer.findMany({
    where: { products: { some: { status: "published" } } },
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: resolveTranslation(row.translations, locale)?.value.name ?? row.slug,
  }));
}

// ---- Writes (Story 4.3, admin CRUD) ---------------------------------------

export interface SeriesEditData {
  id: string;
  slug: string;
  manufacturerId: string;
  translations: { locale: Locale; name: string }[];
}

/** Load one series' raw translations + manufacturer for editing, or null if absent. */
export async function getSeriesForEdit(id: string): Promise<SeriesEditData | null> {
  const row = await prisma.series.findUnique({ where: { id }, include: { translations: true } });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    manufacturerId: row.manufacturerId,
    translations: row.translations.map((t) => ({ locale: t.locale, name: t.name })),
  };
}

/** All series as {id, slug, name, manufacturerId} for the admin product picker (uncached). */
export async function listSeriesAdminOptions(
  locale: Locale,
): Promise<{ id: string; slug: string; name: string; manufacturerId: string }[]> {
  const rows = await prisma.series.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });
  return rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    manufacturerId: s.manufacturerId,
    name: resolveTranslation(s.translations, locale)?.value.name ?? s.slug,
  }));
}

export async function createSeries(data: {
  slug: string;
  manufacturerId: string;
  translations: { locale: Locale; name: string }[];
}): Promise<{ id: string; slug: string }> {
  return prisma.series.create({
    data: {
      slug: data.slug,
      manufacturerId: data.manufacturerId,
      translations: { create: data.translations.map((t) => ({ locale: t.locale, name: t.name })) },
    },
    select: { id: true, slug: true },
  });
}

/** Update a series' manufacturer + replace its translations. Returns false if absent. */
export async function updateSeries(
  id: string,
  manufacturerId: string,
  translations: { locale: Locale; name: string }[],
): Promise<boolean> {
  const exists = await prisma.series.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.series.update({ where: { id }, data: { manufacturerId } }),
    prisma.seriesTranslation.deleteMany({ where: { seriesId: id } }),
    prisma.seriesTranslation.createMany({
      data: translations.map((t) => ({ seriesId: id, locale: t.locale, name: t.name })),
    }),
  ]);
  return true;
}

/** How many products would block a series delete. */
export async function seriesReferenceCounts(id: string): Promise<{ products: number }> {
  return { products: await prisma.product.count({ where: { seriesId: id } }) };
}

/** Delete a series (translations cascade). Caller must check references first. */
export async function deleteSeries(id: string): Promise<void> {
  await prisma.series.delete({ where: { id } });
}
