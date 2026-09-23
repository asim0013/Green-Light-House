"use server";

import { TAGS } from "@/lib/cache-tags";
import {
  createManufacturer,
  updateManufacturerTranslations,
  manufacturerReferenceCounts,
  deleteManufacturer,
} from "@/server/repositories/manufacturer";
import {
  manufacturerCreateSchema,
  manufacturerUpdateSchema,
  idSchema,
  nameDescriptionRows,
} from "./schema";
import { withAdminMutation, MutationError, type MutationResult } from "./mutation";
import { isUniqueViolation } from "./db-errors";
import { mediaHref } from "@/lib/media";

/**
 * Manufacturer CRUD server actions (Story 4.3) — the pattern the other three
 * catalog entities follow. Each runs through {@link withAdminMutation}
 * (requireAdmin → zod → body → revalidate). Purge set: `manufacturers` (the
 * collection read) + `catalog` (the manufacturer facet on `/products`). The
 * `manufacturer:{id}` entity tag is DELIBERATELY unused — it is carried by zero
 * reads (verified), so busting it would be a silent no-op.
 */

// `home` is in the set (Story 4.5): the homepage manufacturer strip renders both
// the name and the logo, so any manufacturer edit can change what it shows.
const MANUFACTURER_TAGS = [TAGS.manufacturers, TAGS.catalog, TAGS.home] as const;

export async function createManufacturerAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(manufacturerCreateSchema, raw, async (input) => {
    try {
      const { id } = await createManufacturer({
        slug: input.slug,
        logoUrl: input.logoAssetId ? mediaHref(input.logoAssetId) : null,
        translations: nameDescriptionRows(input),
      });
      return { tags: MANUFACTURER_TAGS, data: { id } };
    } catch (err) {
      if (isUniqueViolation(err, "slug")) {
        throw new MutationError("slug_taken", "That slug is already in use.", [
          { path: "slug", key: "slugInvalid" },
        ]);
      }
      throw err;
    }
  });
}

export async function updateManufacturerAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(manufacturerUpdateSchema, raw, async (input) => {
    const ok = await updateManufacturerTranslations(
      input.id,
      nameDescriptionRows(input),
      input.logoAssetId ? mediaHref(input.logoAssetId) : null,
    );
    if (!ok) throw new MutationError("not_found", "That manufacturer no longer exists.");
    return { tags: MANUFACTURER_TAGS, data: { id: input.id } };
  });
}

export async function deleteManufacturerAction(
  id: string,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const { series, products } = await manufacturerReferenceCounts(input.id);
    if (series > 0 || products > 0) {
      throw new MutationError(
        "in_use",
        `Cannot delete: ${products} product(s) and ${series} series still reference this manufacturer. Reassign or delete them first.`,
      );
    }
    await deleteManufacturer(input.id);
    return { tags: MANUFACTURER_TAGS, data: { id: input.id } };
  });
}
