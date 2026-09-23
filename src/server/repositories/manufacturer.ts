import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

/**
 * A translation row to write (Story 4.3). Description is only meaningful for
 * entities whose translation table has the column (Manufacturer, Product); the
 * name-only entities pass it absent.
 */
export interface TranslationWrite {
  locale: Locale;
  name: string;
  description?: string | null;
}

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
  return cached(() => queryManufacturers(locale), ["manufacturers", locale], [TAGS.manufacturers]);
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryManufacturers(locale: Locale): Promise<ManufacturerListItem[]> {
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

// ---- Writes (Story 4.3, admin CRUD) ---------------------------------------

/** All three-locale translations for the admin edit form (raw rows, no fallback). */
export interface ManufacturerEditData {
  id: string;
  slug: string;
  /** Current logo delivery href (`/api/media/<id>`), or null. Story 4.5. */
  logoUrl: string | null;
  translations: { locale: Locale; name: string; description: string | null }[];
}

/** Load one manufacturer's raw translations for editing, or null if absent. */
export async function getManufacturerForEdit(id: string): Promise<ManufacturerEditData | null> {
  const row = await prisma.manufacturer.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    logoUrl: row.logoUrl,
    translations: row.translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      description: t.description,
    })),
  };
}

/** Create a manufacturer with its translation rows. Throws on a duplicate slug (P2002). */
export async function createManufacturer(data: {
  slug: string;
  logoUrl?: string | null;
  translations: TranslationWrite[];
}): Promise<{ id: string; slug: string }> {
  return prisma.manufacturer.create({
    data: {
      slug: data.slug,
      logoUrl: data.logoUrl ?? null,
      translations: {
        create: data.translations.map((t) => ({
          locale: t.locale,
          name: t.name,
          description: t.description ?? null,
        })),
      },
    },
    select: { id: true, slug: true },
  });
}

/**
 * Replace a manufacturer's translations and set its logo (slug stays immutable).
 * The logo (`logoUrl`, Story 4.5 — a `/api/media/<id>` href or null) is a media
 * library selection, editable from 4.5 onward. delete-all-then-recreate inside a
 * transaction honours `@@unique([manufacturerId, locale])`; a cleared tab removes
 * its row. Returns false if the manufacturer is gone.
 */
export async function updateManufacturerTranslations(
  id: string,
  translations: TranslationWrite[],
  logoUrl: string | null = null,
): Promise<boolean> {
  const exists = await prisma.manufacturer.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.manufacturer.update({ where: { id }, data: { logoUrl } }),
    prisma.manufacturerTranslation.deleteMany({ where: { manufacturerId: id } }),
    prisma.manufacturerTranslation.createMany({
      data: translations.map((t) => ({
        manufacturerId: id,
        locale: t.locale,
        name: t.name,
        description: t.description ?? null,
      })),
    }),
  ]);
  return true;
}

/** How many rows would block a manufacturer delete (series + products reference it). */
export async function manufacturerReferenceCounts(
  id: string,
): Promise<{ series: number; products: number }> {
  const [series, products] = await Promise.all([
    prisma.series.count({ where: { manufacturerId: id } }),
    prisma.product.count({ where: { manufacturerId: id } }),
  ]);
  return { series, products };
}

/** Delete a manufacturer (translations cascade). Caller must check references first. */
export async function deleteManufacturer(id: string): Promise<void> {
  await prisma.manufacturer.delete({ where: { id } });
}
