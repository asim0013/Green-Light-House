"use server";

import { TAGS } from "@/lib/cache-tags";
import { createTeamMember, updateTeamMember, deleteTeamMember } from "@/server/repositories/team";
import { idSchema } from "@/server/admin/catalog/schema";
import {
  withAdminMutation,
  MutationError,
  type MutationResult,
} from "@/server/admin/catalog/mutation";
import { teamCreateSchema, teamUpdateSchema, teamRows } from "./schema";

/**
 * Team CRUD actions (Story 4.4b). Purge `team`. No public reader yet (Epic 5),
 * but the tag is registered so a future public page's revalidation is a one-liner.
 * Team members are freely deletable — nothing references them.
 */
const TEAM_TAGS = [TAGS.team] as const;

export async function createTeamMemberAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(teamCreateSchema, raw, async (input) => {
    const { id } = await createTeamMember({
      order: input.order,
      photoKey: input.photoAssetId ?? null,
      translations: teamRows(input as Record<string, unknown>),
    });
    return { tags: TEAM_TAGS, data: { id } };
  });
}

export async function updateTeamMemberAction(
  raw: unknown,
): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(teamUpdateSchema, raw, async (input) => {
    const ok = await updateTeamMember(
      input.id,
      input.order,
      teamRows(input as Record<string, unknown>),
      input.photoAssetId ?? null,
    );
    if (!ok) throw new MutationError("not_found", "That team member no longer exists.");
    return { tags: TEAM_TAGS, data: { id: input.id } };
  });
}

export async function deleteTeamMemberAction(id: string): Promise<MutationResult<{ id: string }>> {
  return withAdminMutation(idSchema, { id }, async (input) => {
    await deleteTeamMember(input.id);
    return { tags: TEAM_TAGS, data: { id: input.id } };
  });
}
