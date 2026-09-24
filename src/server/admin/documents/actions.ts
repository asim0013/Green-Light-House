"use server";

import { TAGS } from "@/lib/cache-tags";
import { idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import { updateDocumentMeta, deleteDocument } from "@/server/repositories/document";
import { documentMetaSchema, documentTitleRows } from "./schema";

/**
 * Document metadata + lifecycle actions (Story 4.6). File create/replace are the
 * multipart routes; these are the zod-parseable mutations. Purge `TAGS.documents`
 * alone — all three document readers carry it (verified in `document.ts`), so it
 * invalidates every document-derived cache entry.
 */
const DOCUMENT_TAGS = [TAGS.documents] as const;

export async function updateDocumentMetaAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(documentMetaSchema, raw, async (input) => {
    const ok = await updateDocumentMeta(input.id, {
      type: input.type,
      isPublic: input.isPublic,
      productId: input.productId ?? null,
      manufacturerId: input.manufacturerId ?? null,
      industryIds: input.industryIds,
      translations: documentTitleRows(input),
    });
    if (!ok) throw new MutationError("not_found", "That document no longer exists.");
    return { tags: DOCUMENT_TAGS, data: { id: input.id } };
  });
}

/** Delete a document — the repo removes the S3 object before the row (no ref guard). */
export async function deleteDocumentAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    await deleteDocument(input.id);
    return { tags: DOCUMENT_TAGS, data: { id: input.id } };
  });
}
