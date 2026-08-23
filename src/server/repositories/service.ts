import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface ServiceListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  /** True when the name/description fell back to EN. */
  isFallback: boolean;
}

/**
 * The minimum structural shape `toServiceListItem` consumes — narrower than
 * Prisma's row type so the mapper is unit-testable with plain objects.
 */
export interface ServiceRow {
  id: string;
  slug: string;
  translations: readonly { locale: Locale; name: string; description: string | null }[];
}

/** Resolve one service row for `locale` (EN fallback, FR34a). */
export function toServiceListItem(service: ServiceRow, locale: Locale): ServiceListItem {
  const t = resolveTranslation(service.translations, locale);
  return {
    id: service.id,
    slug: service.slug,
    name: t?.value.name ?? service.slug,
    description: t?.value.description ?? null,
    isFallback: t?.isFallback ?? false,
  };
}

/**
 * Services offered for `industrySlug`, for the Relevant-services block (Story 2.1).
 *
 * NOTE ON VISIBILITY: `Service` has NO status or visibility column at all — unlike
 * `Product`/`Project` (`status`) and `Document` (`is_public`). So "unpublished
 * services are not enumerable" has no meaning here: every seeded service is public
 * by construction. This is a schema fact, not an omission in this read; if service
 * drafts are ever needed, that is a migration, not a filter.
 */
export async function listServicesByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<ServiceListItem[]> {
  return cached(
    () => queryServicesByIndustry(industrySlug, locale, limit),
    ["services-by-industry", industrySlug, locale, String(limit ?? "all")],
    [TAGS.services, TAGS.industry(industrySlug)],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryServicesByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<ServiceListItem[]> {
  const services = await prisma.service.findMany({
    where: { industries: { some: { industry: { slug: industrySlug } } } },
    include: { translations: true },
    orderBy: { slug: "asc" },
    take: limit,
  });

  return services.map((service) => toServiceListItem(service, locale));
}

/**
 * Every service, for the Services page (Story 2.6 — FR23).
 *
 * NO STATUS FILTER, AND THAT IS NOT AN OMISSION. `Service` has no status or
 * visibility column at all — unlike `Product`/`Project` (`status`) and
 * `Document` (`is_public`) — so "unpublished services are not enumerable" has
 * no meaning here: every row is public by construction. This is the same schema
 * fact `listServicesByIndustry` documents above. If service drafts are ever
 * wanted, that is a migration, not a filter added here.
 *
 * Ordered by slug so the page is deterministic and the cached payload stable —
 * there is no `sortOrder` column, and an unordered read would let storage
 * internals choose the page's reading order.
 */
export async function listServices(locale: Locale): Promise<ServiceListItem[]> {
  return cached(() => queryServices(locale), ["services-all", locale], [TAGS.services]);
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryServices(locale: Locale): Promise<ServiceListItem[]> {
  const services = await prisma.service.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return services.map((service) => toServiceListItem(service, locale));
}
