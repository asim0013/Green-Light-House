"use server";

import { TAGS } from "@/lib/cache-tags";
import {
  createIndustry,
  updateIndustryTranslations,
  industryReferenceCounts,
  deleteIndustry,
} from "@/server/repositories/industry";
import { nameDescriptionRows, idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import { isUniqueViolation } from "@/server/admin/catalog/db-errors";
import { industryCreateSchema, industryUpdateSchema } from "./schema";

/**
 * Industry CRUD server actions (Story 4.4). Purge `industries` + `industry:{slug}`
 * — the per-slug tag is the site's highest-fan-out tag (7 reads: industry detail
 * + products/services/projects/documents/categories by that industry), so an
 * industry edit ripples widest. Delete is REFUSED while referenced (its join rows
 * would cascade and projects would be un-linked — too broad to do implicitly).
 */
const tagsFor = (slug: string) => [TAGS.industries, TAGS.industry(slug)] as const;

export async function createIndustryAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(industryCreateSchema, raw, async (input) => {
    try {
      const { id, slug } = await createIndustry({
        slug: input.slug,
        translations: nameDescriptionRows(input),
      });
      return { tags: tagsFor(slug), data: { id } };
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

export async function updateIndustryAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(industryUpdateSchema, raw, async (input) => {
    const slug = await updateIndustryTranslations(input.id, nameDescriptionRows(input));
    if (!slug) throw new MutationError("not_found", "That industry no longer exists.");
    return { tags: tagsFor(slug), data: { id: input.id } };
  });
}

export async function deleteIndustryAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const { products, documents, services, projects } = await industryReferenceCounts(input.id);
    if (products || documents || services || projects) {
      throw new MutationError(
        "in_use",
        `Cannot delete: this industry is referenced by ${products} product(s), ${documents} document(s), ${services} service(s) and ${projects} project(s). Reassign or remove those first.`,
      );
    }
    const slug = await deleteIndustry(input.id);
    if (!slug) throw new MutationError("not_found", "That industry no longer exists.");
    return { tags: tagsFor(slug), data: { id: input.id } };
  });
}
