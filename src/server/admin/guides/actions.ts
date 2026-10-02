"use server";

import { TAGS } from "@/lib/cache-tags";
import { idSchema } from "@/server/admin/catalog/schema";
import { withAdminMutation, MutationError, type MutationResult } from "@/server/admin/catalog/mutation";
import {
  createGuide,
  updateGuide,
  deleteGuide,
  type GuideWriteData,
} from "@/server/repositories/selection-guide";
import { guideCreateSchema, guideUpdateSchema, type GuideCreateInput } from "./schema";

/**
 * Selection-guide admin actions (Story 4.11). Reuse `withAdminMutation`
 * (re-checks `requireAdmin`). Each create/edit/delete purges the `guides` tag so
 * the public index/detail + sitemap go live without a deploy (FR5/FR40).
 */
function toWriteData(input: Omit<GuideCreateInput, "slug">): GuideWriteData {
  return {
    status: input.status,
    translations: input.translations,
    sections: input.sections.map((s, i) => ({ sort: i, translations: s.translations })),
    productIds: input.productIds,
    categoryIds: input.categoryIds,
  };
}

export async function createGuideAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(guideCreateSchema, raw, async (input) => {
    const { id } = await createGuide(input.slug, toWriteData(input));
    return { tags: [TAGS.guides], data: { id } };
  });
}

export async function updateGuideAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(guideUpdateSchema, raw, async (input) => {
    const ok = await updateGuide(input.id, toWriteData(input));
    if (!ok) throw new MutationError("not_found", "That guide no longer exists.");
    return { tags: [TAGS.guides], data: { id: input.id } };
  });
}

export async function deleteGuideAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    await deleteGuide(input.id);
    return { tags: [TAGS.guides], data: { id: input.id } };
  });
}
