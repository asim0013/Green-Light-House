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
