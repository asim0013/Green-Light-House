import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface IndustryListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** True when the name/description fell back to EN. */
  isFallback: boolean;
}

/**
 * List industries with names resolved for `locale` (EN fallback).
 * Data access lives here, never in components/routes (CLAUDE.md boundary).
 */
export async function listIndustries(locale: Locale): Promise<IndustryListItem[]> {
  const industries = await prisma.industry.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return industries.map((industry) => {
    const t = resolveTranslation(industry.translations, locale);
    return {
      id: industry.id,
      slug: industry.slug,
      name: t?.value.name ?? industry.slug,
      description: t?.value.description ?? null,
      isFallback: t?.isFallback ?? false,
    };
  });
}
