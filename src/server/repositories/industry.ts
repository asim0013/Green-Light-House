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
 * The detail read resolves exactly the fields the list read does, so it reuses the
 * shape rather than declaring a parallel one that could drift from it.
 */
export type IndustryDetail = IndustryListItem;

/**
 * The minimum structural shape `toIndustryListItem` consumes. Deliberately
 * narrower than Prisma's row type so the mapper can be unit-tested with plain
 * objects — Prisma's richer rows remain assignable (the `toProjectListItem`
 * pattern from Story 1.7).
 */
export interface IndustryRow {
  id: string;
  slug: string;
  translations: readonly { locale: Locale; name: string; description: string | null }[];
}

/** Resolve one industry row for `locale` (EN fallback, FR34a). */
export function toIndustryListItem(industry: IndustryRow, locale: Locale): IndustryListItem {
  const t = resolveTranslation(industry.translations, locale);
  return {
    id: industry.id,
    slug: industry.slug,
    // Slug, not empty string: an industry with no translation at all still needs a
    // rendered label, and the slug is the only human-readable thing left.
    name: t?.value.name ?? industry.slug,
    description: t?.value.description ?? null,
    isFallback: t?.isFallback ?? false,
  };
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

  return industries.map((industry) => toIndustryListItem(industry, locale));
}

/**
 * One industry by slug, or `null` when it does not exist (Story 2.1).
 *
 * UNLIKE `getProductBySlug`, this can carry its per-entity tag: the convention is
 * `industry:{slug}` and the slug is the argument, so the tag is known before the
 * query runs rather than only after it. `industries` rides along so a
 * collection-level revalidation (an industry added or removed) also clears the
 * detail reads, which would otherwise keep serving a deleted industry for the
 * cache's whole TTL.
 *
 * `slug` is attacker-controlled — it comes straight from the URL — so it lands in
 * the cache KEY, never in a hand-built tag string.
 */
export async function getIndustryBySlug(
  slug: string,
  locale: Locale,
): Promise<IndustryDetail | null> {
  return cached(
    () => queryIndustryBySlug(slug, locale),
    ["industry", slug, locale],
    [TAGS.industry(slug), TAGS.industries],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryIndustryBySlug(
  slug: string,
  locale: Locale,
): Promise<IndustryDetail | null> {
  const industry = await prisma.industry.findUnique({
    where: { slug },
    include: { translations: true },
  });
  if (!industry) return null;

  return toIndustryListItem(industry, locale);
}
