"use server";

import { TAGS } from "@/lib/cache-tags";
import {
  createCategory,
  updateCategory,
  wouldCreateCategoryCycle,
  categoryReferenceCounts,
  deleteCategory,
} from "@/server/repositories/category";
import { categoryCreateSchema, categoryUpdateSchema, idSchema, nameRows } from "./schema";
import { withAdminMutation, MutationError, type MutationResult } from "./mutation";
import { isUniqueViolation } from "./db-errors";

/**
 * Category CRUD server actions (Story 4.3). Purge set: `categories` (the signpost
 * reads) + `catalog` (the tree/detail reads embed published-product counts, so
 * they carry `catalog` too). Parent-cycle rejection lives on the UPDATE path
 * (a fresh category has no children, so create cannot cycle).
 */
const CATEGORY_TAGS = [TAGS.categories, TAGS.catalog] as const;

export async function createCategoryAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(categoryCreateSchema, raw, async (input) => {
    try {
      const { id } = await createCategory({
        slug: input.slug,
        parentId: input.parentId,
        translations: nameRows(input),
      });
      return { tags: CATEGORY_TAGS, data: { id } };
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

export async function updateCategoryAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(categoryUpdateSchema, raw, async (input) => {
    if (input.parentId && (await wouldCreateCategoryCycle(input.id, input.parentId))) {
      throw new MutationError("cycle", "A category cannot be its own parent or descendant.", [
        { path: "parentId", key: "invalid" },
      ]);
    }
    const ok = await updateCategory(input.id, input.parentId ?? null, nameRows(input));
    if (!ok) throw new MutationError("not_found", "That category no longer exists.");
    return { tags: CATEGORY_TAGS, data: { id: input.id } };
  });
}

export async function deleteCategoryAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const { children, products } = await categoryReferenceCounts(input.id);
    if (children > 0 || products > 0) {
      throw new MutationError(
        "in_use",
        `Cannot delete: ${children} child categor(ies) and ${products} product(s) still reference this category. Reassign or delete them first.`,
      );
    }
    await deleteCategory(input.id);
    return { tags: CATEGORY_TAGS, data: { id: input.id } };
  });
}
