"use server";

import { TAGS } from "@/lib/cache-tags";
import { createProject, updateProject, deleteProject } from "@/server/repositories/project";
import { idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import { isUniqueViolation } from "@/server/admin/catalog/db-errors";
import { projectCreateSchema, projectUpdateSchema, projectRows } from "./schema";
import { buildProjectMedia } from "./project-media-attach";

interface ProjectScalarInput {
  industryId?: string;
  status: "draft" | "published";
  deliveredAt?: string;
  leadTimeWeeks?: number;
  mediaAssetId?: string;
}

/**
 * Project CRUD server actions (Story 4.4). Purge `projects` + `project:{slug}`
 * (the per-slug tag alone can't reach the LIST reads — a rename needs `projects`
 * too) + `industry:{slug}` for the old AND new industry (both, because
 * `listProjectsByIndustry` is keyed by industry slug). Draft projects stay
 * invisible (public reads keep `status:"published"`). `media`/BOM untouched.
 */
function projectTags(slug: string, industrySlugs: string[]) {
  return [TAGS.projects, TAGS.project(slug), ...industrySlugs.map((s) => TAGS.industry(s))];
}

// The scalar fields the repo needs, mapped from validated input.
function scalars(input: ProjectScalarInput) {
  return {
    industryId: input.industryId,
    status: input.status,
    deliveredAt: input.deliveredAt ? new Date(input.deliveredAt) : null,
    leadTimeWeeks: typeof input.leadTimeWeeks === "number" ? input.leadTimeWeeks : null,
  };
}

export async function createProjectAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(projectCreateSchema, raw, async (input) => {
    try {
      const { id, slug, industrySlugs } = await createProject({
        slug: input.slug,
        ...scalars(input),
        media: await buildProjectMedia(input.mediaAssetId),
        translations: projectRows(input),
      });
      return { tags: projectTags(slug, industrySlugs), data: { id } };
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

export async function updateProjectAction(raw: unknown): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(projectUpdateSchema, raw, async (input) => {
    const { ok, slug, industrySlugs } = await updateProject(
      input.id,
      { ...scalars(input), media: await buildProjectMedia(input.mediaAssetId) },
      projectRows(input),
    );
    if (!ok || !slug) throw new MutationError("not_found", "That project no longer exists.");
    return { tags: projectTags(slug, industrySlugs), data: { id: input.id } };
  });
}

export async function deleteProjectAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    const { slug, industrySlugs } = await deleteProject(input.id);
    if (!slug) return { tags: [TAGS.projects], data: { id: input.id } };
    return { tags: projectTags(slug, industrySlugs), data: { id: input.id } };
  });
}
