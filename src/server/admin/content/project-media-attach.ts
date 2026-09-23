import { copyObject } from "@/lib/storage";
import { getMediaAssetForAttach } from "@/server/repositories/media";
import { SAFE_IMAGE_MIME, type ProjectMediaEntry, type ProjectMediaAlt } from "@/lib/project-media";

/**
 * Build the `Project.media` array from a selected library asset (Story 4.5, AC7).
 *
 * COPY-ON-ATTACH, not by-reference. The frozen `Project.media` delivery route
 * (`/api/projects/[slug]/media/[id]`) serves ONLY `projects/`-prefixed keys, so a
 * library asset (`media/…`) is copied into the project's own namespace and a
 * frozen `ProjectMediaEntry` is written — `project-media.ts`, that route and
 * `ProjectMediaBand` are untouched. The copy is independent of the library
 * original (deleting the library asset does not break the project).
 *
 * The entry carries an ADDITIVE `sourceAssetId` so the edit form can preload the
 * picker and a re-save is idempotent. It is NOT part of the frozen
 * `ProjectMediaEntry` type; `parseProjectMedia` tolerates the extra property and
 * every typed consumer ignores it, so the frozen contract's behaviour is unchanged.
 *
 * A single primary image (entry id `"primary"`); a multi-image gallery stays
 * deferred (project-media deferred-work). Non-image or missing asset → `[]`.
 */
export type ProjectMediaEntryWithSource = ProjectMediaEntry & { sourceAssetId: string };

function extensionOf(storageKey: string): string {
  const dot = storageKey.lastIndexOf(".");
  return dot > 0 ? storageKey.slice(dot + 1) : "bin";
}

export async function buildProjectMedia(
  mediaAssetId: string | undefined,
): Promise<ProjectMediaEntryWithSource[]> {
  if (!mediaAssetId) return [];
  const asset = await getMediaAssetForAttach(mediaAssetId);
  if (!asset) return [];
  // Only images belong in the frozen shape (SVG already excluded at upload).
  if (!(SAFE_IMAGE_MIME as readonly string[]).includes(asset.mime)) return [];

  const destinationKey = `projects/${globalThis.crypto.randomUUID()}.${extensionOf(asset.storageKey)}`;
  await copyObject(asset.storageKey, destinationKey, asset.mime);

  // EN is required by the frozen alt shape; fall back to an empty string (the
  // band still renders — an admin should author alt on the asset).
  const alt: ProjectMediaAlt = { en: asset.alt.en ?? "" };
  if (asset.alt.tr) alt.tr = asset.alt.tr;
  if (asset.alt.ru) alt.ru = asset.alt.ru;

  return [
    {
      id: "primary",
      storageKey: destinationKey,
      mime: asset.mime,
      alt,
      sort: 0,
      sourceAssetId: mediaAssetId,
    },
  ];
}

/** Recover the source library asset id from a raw `Project.media` JSON value. */
export function sourceAssetIdOf(media: unknown): string | null {
  if (!Array.isArray(media)) return null;
  const first = media[0];
  if (
    first &&
    typeof first === "object" &&
    typeof (first as { sourceAssetId?: unknown }).sourceAssetId === "string"
  ) {
    return (first as { sourceAssetId: string }).sourceAssetId;
  }
  return null;
}
