"use server";

import { TAGS } from "@/lib/cache-tags";
import {
  createService,
  updateServiceTranslations,
  serviceLinkedIndustrySlugs,
  deleteService,
} from "@/server/repositories/service";
import { nameDescriptionRows, idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import { isUniqueViolation } from "@/server/admin/catalog/db-errors";
import { serviceCreateSchema, serviceUpdateSchema } from "./schema";

/**
 * Service CRUD server actions (Story 4.4). Purge `services` + `industry:{slug}`
 * for every industry the service is linked to (its name shows on those industry
 * pages via `listServicesByIndustry`); there is no per-service tag. Delete is
 * allowed — `ServiceIndustry` links + translations cascade harmlessly.
 */
const tagsFor = (industrySlugs: string[]) => [
  TAGS.services,
  ...industrySlugs.map((s) => TAGS.industry(s)),
];

export async function createServiceAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(serviceCreateSchema, raw, async (input) => {
    try {
      const { id } = await createService({
        slug: input.slug,
        translations: nameDescriptionRows(input),
      });
      // A brand-new service has no industry links yet — just the collection tag.
      return { tags: [TAGS.services], data: { id } };
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

export async function updateServiceAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(serviceUpdateSchema, raw, async (input) => {
    const linked = await serviceLinkedIndustrySlugs(input.id);
    const ok = await updateServiceTranslations(input.id, nameDescriptionRows(input));
    if (!ok) throw new MutationError("not_found", "That service no longer exists.");
    return { tags: tagsFor(linked), data: { id: input.id } };
  });
}

export async function deleteServiceAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    // Read the linked industries BEFORE the delete cascades the join rows away.
    const linked = await serviceLinkedIndustrySlugs(input.id);
    await deleteService(input.id);
    return { tags: tagsFor(linked), data: { id: input.id } };
  });
}
