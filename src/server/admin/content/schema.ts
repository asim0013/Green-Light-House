import { z } from "zod";
import {
  slugField,
  idField,
  requiredText,
  optionalText,
  withDescriptionNameGuard,
  nameDescriptionShape,
} from "@/server/admin/catalog/schema";

/**
 * Admin editorial-content CRUD schemas (Story 4.4) — Projects, Services,
 * Industries. Reuses the Story 4.3 primitives (shared zod field validators,
 * slug/id, the description-without-name guard) and the same stable-error-key +
 * inline-English doctrine. The server action is authoritative.
 *
 * Homepage content and Team are NOT here — they have no data model (Story 4.4
 * Decision 0); they need their own foundation story.
 */

const NAME_MAX = 200;
const DESCRIPTION_MAX = 4000;

// ---- Industry (name + description) -----------------------------------------
export const industryCreateSchema = withDescriptionNameGuard({
  slug: slugField,
  ...nameDescriptionShape,
});
export const industryUpdateSchema = withDescriptionNameGuard({
  id: idField,
  ...nameDescriptionShape,
});
export type IndustryCreateInput = z.infer<typeof industryCreateSchema>;
export type IndustryUpdateInput = z.infer<typeof industryUpdateSchema>;

// ---- Service (name + description) ------------------------------------------
export const serviceCreateSchema = withDescriptionNameGuard({
  slug: slugField,
  ...nameDescriptionShape,
});
export const serviceUpdateSchema = withDescriptionNameGuard({
  id: idField,
  ...nameDescriptionShape,
});
export type ServiceCreateInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateInput = z.infer<typeof serviceUpdateSchema>;

// ---- Project (title + 4 optional translated fields + scalars) --------------
// `title` is the row anchor (required on EN); the rest are optional prose.
const PROJECT_TRANSLATED: { name: string; max: number; anchor: boolean }[] = [
  { name: "title", max: NAME_MAX, anchor: true },
  { name: "description", max: DESCRIPTION_MAX, anchor: false },
  { name: "outcome", max: DESCRIPTION_MAX, anchor: false },
  { name: "scope", max: NAME_MAX, anchor: false },
  { name: "location", max: NAME_MAX, anchor: false },
];

function projectTranslationShape(): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const loc of ["En", "Tr", "Ru"] as const) {
    for (const f of PROJECT_TRANSLATED) {
      // `title` is required only on EN; every other field (and TR/RU title) is optional.
      shape[`${f.name}${loc}`] =
        f.anchor && loc === "En" ? requiredText(f.max) : optionalText(f.max);
    }
  }
  return shape;
}

const optionalIdOrEmpty = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

// A yyyy-mm-dd date string or absent; the action turns it into a Date.
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "invalid")
  .optional()
  .or(z.literal("").transform(() => undefined));

// A non-negative lead time in weeks; the number input sends a string. Empty →
// absent must be handled BEFORE coercion (Number("") === 0 would slip through).
const optionalWeeks = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? undefined : v),
  z.coerce.number().int("invalid").min(0, "invalid").max(520, "invalid").optional(),
);

const projectScalars = {
  industryId: optionalIdOrEmpty,
  status: z.enum(["draft", "published"]),
  deliveredAt: optionalDate,
  leadTimeWeeks: optionalWeeks,
} as const;

/** Reject a TR/RU field supplied for a locale whose title is empty (an orphaned row). */
function projectLocaleGuard<T extends z.ZodTypeAny>(schema: T) {
  return schema.superRefine((value, ctx) => {
    const v = value as Record<string, unknown>;
    for (const loc of ["Tr", "Ru"] as const) {
      if (v[`title${loc}`]) continue;
      for (const f of PROJECT_TRANSLATED) {
        if (f.anchor) continue;
        if (v[`${f.name}${loc}`]) {
          ctx.addIssue({
            code: "custom",
            path: [`${f.name}${loc}`],
            message: "titleRequiredForLocale",
          });
        }
      }
    }
  });
}

export const projectCreateSchema = projectLocaleGuard(
  z.object({ slug: slugField, ...projectScalars, ...projectTranslationShape() }),
);
export const projectUpdateSchema = projectLocaleGuard(
  z.object({ id: idField, ...projectScalars, ...projectTranslationShape() }),
);
export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectUpdateInput = z.infer<typeof projectUpdateSchema>;

// ---- Translation-row assembly ----------------------------------------------

export interface ProjectTranslationRow {
  locale: "en" | "tr" | "ru";
  title: string;
  description: string | null;
  outcome: string | null;
  scope: string | null;
  location: string | null;
}

/** Build project translation rows: EN always; TR/RU only when their title is set. */
export function projectRows(input: Record<string, unknown>): ProjectTranslationRow[] {
  const rows: ProjectTranslationRow[] = [];
  const add = (loc: "En" | "Tr" | "Ru", locale: ProjectTranslationRow["locale"]) => {
    const title = input[`title${loc}`] as string | undefined;
    if (!title) return;
    rows.push({
      locale,
      title,
      description: (input[`description${loc}`] as string | undefined) ?? null,
      outcome: (input[`outcome${loc}`] as string | undefined) ?? null,
      scope: (input[`scope${loc}`] as string | undefined) ?? null,
      location: (input[`location${loc}`] as string | undefined) ?? null,
    });
  };
  add("En", "en");
  add("Tr", "tr");
  add("Ru", "ru");
  return rows;
}
