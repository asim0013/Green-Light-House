"use server";

import { TAGS } from "@/lib/cache-tags";
import {
  createSeries,
  updateSeries,
  seriesReferenceCounts,
  deleteSeries,
} from "@/server/repositories/series";
import { seriesCreateSchema, seriesUpdateSchema, idSchema, nameRows } from "./schema";
import { withAdminMutation, MutationError, type MutationResult } from "./mutation";
import { isUniqueViolation } from "./db-errors";

/**
 * Series CRUD server actions (Story 4.3). Purge set: `catalog` ONLY — Series has
 * no tag of its own; the series facet on `/products` rides on `catalog`.
 */
const SERIES_TAGS = [TAGS.catalog] as const;

export async function createSeriesAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(seriesCreateSchema, raw, async (input) => {
    try {
      const { id } = await createSeries({
        slug: input.slug,
        manufacturerId: input.manufacturerId,
        translations: nameRows(input),
      });
      return { tags: SERIES_TAGS, data: { id } };
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

export async function updateSeriesAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(seriesUpdateSchema, raw, async (input) => {
    const ok = await updateSeries(input.id, input.manufacturerId, nameRows(input));
    if (!ok) throw new MutationError("not_found", "That series no longer exists.");
    return { tags: SERIES_TAGS, data: { id: input.id } };
  });
}

export async function deleteSeriesAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const { products } = await seriesReferenceCounts(input.id);
    if (products > 0) {
      throw new MutationError(
        "in_use",
        `Cannot delete: ${products} product(s) still reference this series. Reassign them first.`,
      );
    }
    await deleteSeries(input.id);
    return { tags: SERIES_TAGS, data: { id: input.id } };
  });
}
