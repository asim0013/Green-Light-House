import { z } from "zod";
import { slugField, idField, requiredText, optionalText } from "@/server/admin/catalog/schema";

/**
 * Selection-guide admin schemas (Story 4.11). STRUCTURED (not the flat
 * `TranslationTabs` shape) because a guide has a VARIABLE-LENGTH list of sections,
 * each with its own per-locale translations — the form assembles the nested
 * payload and the action validates it here. EN is the required anchor (a guide /
 * section with no EN text is invalid); TR/RU optional (EN fallback, FR34a).
 */

const TITLE_MAX = 200;
const BODY_MAX = 8000;

const localeEnum = z.enum(["en", "tr", "ru"]);

/** optional bounded text that stores `null` when blank/absent. */
function optionalNullable(max: number) {
  return optionalText(max)
    .transform((v) => v ?? null)
    .nullable();
}

const guideTranslation = z.object({
  locale: localeEnum,
  title: requiredText(TITLE_MAX),
  intro: optionalNullable(BODY_MAX),
  metaDescription: optionalNullable(300),
});

const sectionTranslation = z.object({
  locale: localeEnum,
  heading: requiredText(TITLE_MAX),
  body: requiredText(BODY_MAX),
});

const section = z.object({
  translations: z.array(sectionTranslation).min(1, "required"),
});

/** At least one translation, and it must include EN (the anchor). */
const hasEn = (rows: { locale: string }[]) => rows.some((r) => r.locale === "en");

const guideBody = {
  status: z.enum(["draft", "published"]),
  translations: z.array(guideTranslation).min(1, "required").refine(hasEn, "enRequired"),
  sections: z
    .array(section)
    .refine((secs) => secs.every((s) => hasEn(s.translations)), "sectionEnRequired"),
  productIds: z.array(idField).default([]),
  categoryIds: z.array(idField).default([]),
};

export const guideCreateSchema = z.object({ slug: slugField, ...guideBody });
export const guideUpdateSchema = z.object({ id: idField, ...guideBody });
export type GuideCreateInput = z.infer<typeof guideCreateSchema>;
export type GuideUpdateInput = z.infer<typeof guideUpdateSchema>;
