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

// ---- Writes (Story 4.4, admin CRUD) ---------------------------------------

export interface ServiceEditData {
  id: string;
  slug: string;
  translations: { locale: Locale; name: string; description: string | null }[];
}

/** All services as {id, slug, name} for the admin list (EN fallback). */
export async function listServiceOptions(
  locale: Locale,
): Promise<{ id: string; slug: string; name: string }[]> {
  const rows = await prisma.service.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });
  return rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: resolveTranslation(s.translations, locale)?.value.name ?? s.slug,
  }));
}

/** Load one service's raw translations for editing, or null if absent. */
export async function getServiceForEdit(id: string): Promise<ServiceEditData | null> {
  const row = await prisma.service.findUnique({ where: { id }, include: { translations: true } });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    translations: row.translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      description: t.description,
    })),
  };
}

/**
 * The slugs of every industry this service is linked to (via ServiceIndustry).
 * The service's name shows on those industry pages (`listServicesByIndustry`),
 * so a create/update/delete must bust each `industry:{slug}` tag.
 */
export async function serviceLinkedIndustrySlugs(serviceId: string): Promise<string[]> {
  const links = await prisma.serviceIndustry.findMany({
    where: { serviceId },
    select: { industry: { select: { slug: true } } },
  });
  return links.map((l) => l.industry.slug);
}

export async function createService(data: {
  slug: string;
  translations: { locale: Locale; name: string; description: string | null }[];
}): Promise<{ id: string; slug: string }> {
  return prisma.service.create({
    data: {
      slug: data.slug,
      translations: {
        create: data.translations.map((t) => ({
          locale: t.locale,
          name: t.name,
          description: t.description,
        })),
      },
    },
    select: { id: true, slug: true },
  });
}

/** Replace a service's translations (slug immutable). Returns false if absent. */
export async function updateServiceTranslations(
  id: string,
  translations: { locale: Locale; name: string; description: string | null }[],
): Promise<boolean> {
  const exists = await prisma.service.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.serviceTranslation.deleteMany({ where: { serviceId: id } }),
    prisma.serviceTranslation.createMany({
      data: translations.map((t) => ({
        serviceId: id,
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
    }),
  ]);
  return true;
}

/** Delete a service (ServiceIndustry links + translations cascade). */
export async function deleteService(id: string): Promise<void> {
  await prisma.service.delete({ where: { id } });
}
