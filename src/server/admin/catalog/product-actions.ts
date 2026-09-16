"use server";

import { TAGS } from "@/lib/cache-tags";
import {
  createProduct,
  updateProduct,
  productReferenceCounts,
  deleteProduct,
} from "@/server/repositories/product";
import {
  productCreateSchema,
  productUpdateSchema,
  idSchema,
  nameDescriptionRows,
  attributesObject,
} from "./schema";
import { withAdminMutation, MutationError, type MutationResult } from "./mutation";
import { isUniqueViolation } from "./db-errors";

/**
 * Product CRUD server actions (Story 4.3). Purge set: `catalog` (on every cached
 * product surface + the category-tree counts + both facets) + `product:{id}`
 * (the detail entry). Publish/unpublish is just `status` on the same set — and
 * MUST bust `catalog` so `resolveProductId`'s slug→id hop re-resolves after a
 * draft goes live (the cached-null poisoning caveat, product.ts:167-200).
 */
const productTags = (id: string) => [TAGS.catalog, TAGS.product(id)] as const;

export async function createProductAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(productCreateSchema, raw, async (input) => {
    try {
      const { id } = await createProduct({
        slug: input.slug,
        model: input.model,
        manufacturerId: input.manufacturerId,
        categoryId: input.categoryId,
        seriesId: input.seriesId,
        status: input.status,
        attributes: attributesObject(input.attributes),
        translations: nameDescriptionRows(input),
      });
      return { tags: productTags(id), data: { id } };
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

export async function updateProductAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(productUpdateSchema, raw, async (input) => {
    const ok = await updateProduct(
      input.id,
      {
        model: input.model,
        manufacturerId: input.manufacturerId,
        categoryId: input.categoryId,
        seriesId: input.seriesId,
        status: input.status,
        attributes: attributesObject(input.attributes),
      },
      nameDescriptionRows(input),
    );
    if (!ok) throw new MutationError("not_found", "That product no longer exists.");
    return { tags: productTags(input.id), data: { id: input.id } };
  });
}

export async function deleteProductAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const { bomLines, accessories, crossReferences } = await productReferenceCounts(input.id);
    if (bomLines > 0 || accessories > 0 || crossReferences > 0) {
      throw new MutationError(
        "in_use",
        `Cannot delete: this product is referenced by ${bomLines} project BOM line(s), ${accessories} accessory link(s) and ${crossReferences} cross-reference(s). Remove those first.`,
      );
    }
    await deleteProduct(input.id);
    return { tags: productTags(input.id), data: { id: input.id } };
  });
}
