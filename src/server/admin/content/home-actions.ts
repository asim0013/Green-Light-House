"use server";

import type { Locale } from "@prisma/client";
import { TAGS } from "@/lib/cache-tags";
import { updateHomeContent } from "@/server/repositories/home-content";
import { withAdminMutation, type MutationResult } from "@/server/admin/catalog/mutation";
import { homeContentSchema, homeContentRows } from "./schema";

/**
 * Homepage content editor action (Story 4.4b). A SINGLETON — upsert-in-place, no
 * create/delete. Purge `home`. The homepage reads the model with `messages` as
 * the field-by-field fallback, so this edit reaches the page with no redeploy.
 */
export async function updateHomeContentAction(raw: unknown): Promise<MutationResult<{ ok: true }>> {
  return withAdminMutation(homeContentSchema, raw, async (input) => {
    const rows = homeContentRows(input as Record<string, unknown>);
    await updateHomeContent({
      certMarks: input.certMarks ?? [],
      translations: rows.map((r) => {
        const { locale, ...fields } = r;
        return { locale: locale as Locale, ...fields };
      }),
    });
    return { tags: [TAGS.home], data: { ok: true } };
  });
}
