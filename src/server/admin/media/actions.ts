"use server";

import { TAGS } from "@/lib/cache-tags";
import { idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import {
  updateMediaAssetAlt,
  deleteMediaAsset,
  mediaAssetReferenceCounts,
  isReferenced,
} from "@/server/repositories/media";
import { mediaAltSchema, mediaAltRows } from "./schema";

/**
 * Media library actions (Story 4.5). Upload is the multipart route
 * `POST /api/admin/media`; these cover the metadata + lifecycle mutations.
 *
 * Purge `media` on every change. A change that also alters a CONSUMER surface (a
 * logo, a project photo) purges that consumer's tag from the consumer's own
 * action (ManufacturerForm/ProjectForm paths) — editing an asset's alt does not
 * change any consumer's rendered bytes, so `media` alone suffices here.
 */
const MEDIA_TAGS = [TAGS.media] as const;

export async function updateMediaAssetAltAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(mediaAltSchema, raw, async (input) => {
    const ok = await updateMediaAssetAlt(input.id, mediaAltRows(input as Record<string, unknown>));
    if (!ok) throw new MutationError("not_found", "That media asset no longer exists.");
    return { tags: MEDIA_TAGS, data: { id: input.id } };
  });
}

/**
 * Delete an asset — REFUSED while any consumer references it (`in_use`), mirroring
 * `deleteCategory`/`deleteIndustry`. The reference scan spans manufacturer logos,
 * team photos, and project/product media (see `mediaAssetReferenceCounts`). The
 * repository deletes the S3 object before the row.
 */
export async function deleteMediaAssetAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const counts = await mediaAssetReferenceCounts(input.id);
    if (isReferenced(counts)) {
      throw new MutationError(
        "in_use",
        "This asset is in use and cannot be deleted. Remove it from every item that uses it first.",
      );
    }
    await deleteMediaAsset(input.id);
    return { tags: MEDIA_TAGS, data: { id: input.id } };
  });
}
