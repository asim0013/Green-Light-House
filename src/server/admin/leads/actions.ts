"use server";

import { idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import { updateLeadStatus, deleteLeadWithAttachment } from "@/server/repositories/lead";
import { leadStatusSchema } from "./schema";

/**
 * Lead actions (Story 4.7). Leads have NO public reader, so the purge set is
 * empty (`[]`) — admin reads are uncached and always live. Both run through
 * `withAdminMutation` (re-checks `requireAdmin`).
 */
const NO_TAGS = [] as const;

export async function updateLeadStatusAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(leadStatusSchema, raw, async (input) => {
    const ok = await updateLeadStatus(input.id, input.status);
    if (!ok) throw new MutationError("not_found", "That lead no longer exists.");
    return { tags: NO_TAGS, data: { id: input.id } };
  });
}

/**
 * Delete a lead (FR45 erasure). `deleteLeadWithAttachment` removes the S3 object
 * BEFORE the row (idempotent, no-op if already gone) — the lead then vanishes
 * from the list and every future export.
 */
export async function deleteLeadAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    await deleteLeadWithAttachment(input.id);
    return { tags: NO_TAGS, data: { id: input.id } };
  });
}
