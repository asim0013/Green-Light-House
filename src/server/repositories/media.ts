import type { Locale, MediaKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";
import { deleteObject } from "@/lib/storage";
import { mediaHref, mediaIdFromHref } from "@/lib/media";
import { parseProjectMedia } from "@/lib/project-media";

/**
 * MEDIA LIBRARY repository (Story 4.5 — FR37). The library is a first-class,
 * reusable entity: upload once (via `POST /api/admin/media`, which scans then
 * stores then calls `createMediaAsset`), reference from many content surfaces.
 *
 * `storageKey` NEVER leaves this layer — the list/option/edit DTOs expose only
 * `id`, `originalName`, `kind`, `mime` and the `/api/media/<id>` href. The bucket
 * stays private; delivery is same-origin through the app route.
 */

export interface MediaTranslationWrite {
  locale: Locale;
  alt: string;
}

export interface MediaAssetRow {
  id: string;
  href: string;
  kind: MediaKind;
  mime: string;
  originalName: string;
  sizeBytes: number;
  /** EN-fallback alt for the admin list; null when no alt authored in any locale. */
  alt: string | null;
  createdAt: Date;
}

export interface MediaAssetOption {
  id: string;
  href: string;
  kind: MediaKind;
  /** A human label for the picker: the EN-fallback alt, else the original filename. */
  label: string;
}

export interface MediaAssetEditData {
  id: string;
  href: string;
  kind: MediaKind;
  mime: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  translations: { locale: Locale; alt: string }[];
}

/** Reference counts across every consumer — the delete guard's evidence. */
export interface MediaReferenceCounts {
  manufacturers: number;
  teamMembers: number;
  projects: number;
  products: number;
}

/** All assets for the admin library grid, newest first. */
export async function listMediaAssets(locale: Locale): Promise<MediaAssetRow[]> {
  const rows = await prisma.mediaAsset.findMany({
    include: { translations: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    href: mediaHref(a.id),
    kind: a.kind,
    mime: a.mime,
    originalName: a.originalName,
    sizeBytes: a.sizeBytes,
    alt: resolveTranslation(a.translations, locale)?.value.alt ?? null,
    createdAt: a.createdAt,
  }));
}

/** Image assets as picker options (EN-fallback label). Images only — the current
 * consumers (logo, project band, product, team photo) are all image surfaces. */
export async function listMediaAssetOptions(locale: Locale): Promise<MediaAssetOption[]> {
  const rows = await prisma.mediaAsset.findMany({
    where: { kind: "image" },
    include: { translations: true },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((a) => ({
    id: a.id,
    href: mediaHref(a.id),
    kind: a.kind,
    label: resolveTranslation(a.translations, locale)?.value.alt || a.originalName,
  }));
}

export async function getMediaAssetForEdit(id: string): Promise<MediaAssetEditData | null> {
  const a = await prisma.mediaAsset.findUnique({ where: { id }, include: { translations: true } });
  if (!a) return null;
  return {
    id: a.id,
    href: mediaHref(a.id),
    kind: a.kind,
    mime: a.mime,
    originalName: a.originalName,
    sizeBytes: a.sizeBytes,
    width: a.width,
    height: a.height,
    translations: a.translations.map((t) => ({ locale: t.locale, alt: t.alt })),
  };
}

/** Resolve an asset's storageKey for the delivery route. Server-only by design. */
export async function getMediaStorageKey(
  id: string,
): Promise<{ storageKey: string; mime: string; kind: MediaKind } | null> {
  return prisma.mediaAsset.findUnique({
    where: { id },
    select: { storageKey: true, mime: true, kind: true },
  });
}

/** An asset's storageKey/mime/kind + per-locale alt — for the project copy-on-attach. */
export async function getMediaAssetForAttach(id: string): Promise<{
  storageKey: string;
  mime: string;
  kind: MediaKind;
  alt: { en?: string; tr?: string; ru?: string };
} | null> {
  const a = await prisma.mediaAsset.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!a) return null;
  const alt: { en?: string; tr?: string; ru?: string } = {};
  for (const t of a.translations) alt[t.locale] = t.alt;
  return { storageKey: a.storageKey, mime: a.mime, kind: a.kind, alt };
}

/**
 * Persist a scanned+stored asset. Called by the upload route AFTER a clean scan
 * and a successful `putObject` — never before. `translations` is optional (an EN
 * alt supplied at upload time); alt is otherwise authored on the edit page.
 */
export async function createMediaAsset(data: {
  storageKey: string;
  kind: MediaKind;
  mime: string;
  originalName: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  translations?: MediaTranslationWrite[];
}): Promise<{ id: string }> {
  return prisma.mediaAsset.create({
    data: {
      storageKey: data.storageKey,
      kind: data.kind,
      mime: data.mime,
      originalName: data.originalName,
      sizeBytes: data.sizeBytes,
      width: data.width ?? null,
      height: data.height ?? null,
      translations: data.translations?.length
        ? { create: data.translations.map((t) => ({ locale: t.locale, alt: t.alt })) }
        : undefined,
    },
    select: { id: true },
  });
}

/** Replace an asset's alt translations (delete-recreate). Returns false if absent. */
export async function updateMediaAssetAlt(
  id: string,
  translations: MediaTranslationWrite[],
): Promise<boolean> {
  const exists = await prisma.mediaAsset.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.mediaAssetTranslation.deleteMany({ where: { assetId: id } }),
    prisma.mediaAssetTranslation.createMany({
      data: translations.map((t) => ({ assetId: id, locale: t.locale, alt: t.alt })),
    }),
  ]);
  return true;
}

/**
 * Count references to an asset across every consumer. A non-zero total refuses a
 * delete (`in_use`), mirroring `industryReferenceCounts`. Consumers reference an
 * asset in three different physical shapes:
 *  - `Manufacturer.logoUrl` stores the `/api/media/<id>` href → match the id back out.
 *  - `TeamMember.photoKey` stores the bare asset id.
 *  - `Project.media` / `Product.media` are JSON — scanned app-side by storageKey
 *    (project, frozen `ProjectMediaEntry[]`) or by id (product, `string[]`).
 */
export async function mediaAssetReferenceCounts(id: string): Promise<MediaReferenceCounts> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { storageKey: true },
  });
  const href = mediaHref(id);

  const [manufacturers, teamMembers, projectRows, productRows] = await Promise.all([
    prisma.manufacturer.count({ where: { logoUrl: href } }),
    prisma.teamMember.count({ where: { photoKey: id } }),
    prisma.project.findMany({ select: { media: true } }),
    prisma.product.findMany({ select: { media: true } }),
  ]);

  const storageKey = asset?.storageKey;
  const projects = storageKey
    ? projectRows.filter((p) => parseProjectMedia(p.media).some((m) => m.storageKey === storageKey))
        .length
    : 0;
  const products = productRows.filter(
    (p) => Array.isArray(p.media) && (p.media as unknown[]).includes(id),
  ).length;

  return { manufacturers, teamMembers, projects, products };
}

export function isReferenced(counts: MediaReferenceCounts): boolean {
  return (
    counts.manufacturers > 0 || counts.teamMembers > 0 || counts.projects > 0 || counts.products > 0
  );
}

/**
 * Delete an asset: the S3 OBJECT first, then the row (storage delete-ordering —
 * `storage.ts` — so a crash leaves an orphaned row, never a row pointing at a gone
 * object). Callers MUST check `mediaAssetReferenceCounts` first; this does not.
 */
export async function deleteMediaAsset(id: string): Promise<void> {
  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { storageKey: true },
  });
  if (!asset) return;
  await deleteObject(asset.storageKey);
  await prisma.mediaAsset.delete({ where: { id } });
}

/** Recover an asset id from a stored logoUrl-style href (re-exported for callers). */
export { mediaIdFromHref };
