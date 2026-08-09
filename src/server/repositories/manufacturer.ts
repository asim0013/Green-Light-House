import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface ManufacturerListItem {
  id: string;
  slug: string;
  name: string;
  /**
   * Null for every seeded row — real logo assets arrive with the media library
   * (Story 4.5). Consumers MUST render a wordmark rather than an <img> with an
   * empty src.
   */
  logoUrl: string | null;
  /** True when the name fell back to EN. */
  isFallback: boolean;
}

/**
 * List manufacturers with names resolved for `locale` (EN fallback).
 * Data access lives here, never in components/routes (CLAUDE.md boundary).
 */
export async function listManufacturers(locale: Locale): Promise<ManufacturerListItem[]> {
  const manufacturers = await prisma.manufacturer.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return manufacturers.map((manufacturer) => {
    const t = resolveTranslation(manufacturer.translations, locale);
    return {
      id: manufacturer.id,
      slug: manufacturer.slug,
      name: t?.value.name ?? manufacturer.slug,
      logoUrl: manufacturer.logoUrl,
      isFallback: t?.isFallback ?? false,
    };
  });
}
