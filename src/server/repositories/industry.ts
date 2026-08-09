import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
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
 *
 * Cached in Redis and tagged `industries` (Story 1.8). The locale is part of the
 * cache key — omitting it would serve one locale's text to all three.
 */
export async function listIndustries(locale: Locale): Promise<IndustryListItem[]> {
  return cached(() => queryIndustries(locale), ["industries", locale], [TAGS.industries]);
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryIndustries(locale: Locale): Promise<IndustryListItem[]> {
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
