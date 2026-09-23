import { z } from "zod";
import { isValidSlug } from "@/lib/slug";
import { isStorableText } from "@/server/rfq/schema";

/**
 * Admin catalog CRUD schemas (Story 4.3) — ONE zod module, BOTH sides.
 *
 * The client forms (react-hook-form + the reusable `@/lib/zod-resolver`) and the
 * server actions import THESE schemas, so a submission that bypasses the client
 * is rejected identically; the server action is authoritative.
 *
 * ERROR MESSAGES ARE STABLE KEYS (see {@link CATALOG_ERROR_KEYS}), same doctrine
 * as the RFQ schema. But unlike RFQ, admin copy is INLINE ENGLISH (Story
 * 4.1/4.2) — the client maps these keys through `CATALOG_ERROR_TEXT`, not
 * next-intl `t()`.
 *
 * TRANSLATION SHAPE. Each entity carries a per-locale block. EN is required (the
 * fallback contract fills only FROM `en`, never sideways TR↔RU — a TR-only item
 * would render its slug on EN). TR/RU are optional; a locale row is written iff
 * its `name` is present, so clearing a tab removes that translation row. A
 * description supplied for a locale with no name is rejected (a translation row
 * is anchored on its name).
 */

/** Stable keys the client renders as inline English. Exported so tests pin the set. */
export const CATALOG_ERROR_KEYS = [
  "required",
  "tooLong",
  "invalid",
  "slugInvalid",
  "enRequired",
  "descriptionWithoutName",
  "duplicateAttributeKey",
] as const;

export type CatalogErrorKey = (typeof CATALOG_ERROR_KEYS)[number];

const NAME_MAX = 200;
const DESCRIPTION_MAX = 4000;
const ATTR_KEY_MAX = 64;
const ATTR_VALUE_MAX = 500;
const ATTR_MAX_PAIRS = 60;

/** Required bounded text: trimmed, non-empty, capped, hostile code points rejected. Shared with 4.4. */
export function requiredText(max: number) {
  return z
    .string("required")
    .trim()
    .min(1, "required")
    .max(max, "tooLong")
    .refine(isStorableText, "invalid");
}

/** Optional bounded text. `""`/absent both mean "no value"; the action stores null. Shared with 4.4. */
export function optionalText(max: number) {
  return z
    .string("invalid")
    .trim()
    .max(max, "tooLong")
    .refine(isStorableText, "invalid")
    .optional()
    .or(z.literal("").transform(() => undefined));
}

/** The stored, matched-exactly slug (Story 2.1 D2): lowercase ASCII+digits, hyphens, ≤64. */
export const slugField = z.string("slugInvalid").trim().refine(isValidSlug, "slugInvalid");

/** A required entity id (cuid). */
export const idField = z.string("required").min(1, "required");

/** A bare entity id, for delete actions. */
export const idSchema = z.object({ id: idField });

/**
 * Per-locale translation field SHAPES (spread into each entity's object). Only
 * EN is required; a locale is "present" when its trimmed name is non-empty.
 * Kept as raw shapes — NOT pre-built refined schemas — because zod's `.and()`
 * intersection does not propagate `.refine` effects, so the description/name
 * guard must attach to the FINAL composed object.
 */
const nameOnlyShape = {
  nameEn: requiredText(NAME_MAX),
  nameTr: optionalText(NAME_MAX),
  nameRu: optionalText(NAME_MAX),
} as const;

export const nameDescriptionShape = {
  nameEn: requiredText(NAME_MAX),
  descriptionEn: optionalText(DESCRIPTION_MAX),
  nameTr: optionalText(NAME_MAX),
  descriptionTr: optionalText(DESCRIPTION_MAX),
  nameRu: optionalText(NAME_MAX),
  descriptionRu: optionalText(DESCRIPTION_MAX),
} as const;

/**
 * Build an object schema from `shape` and reject a description supplied for a
 * locale whose name is empty — a translation row is anchored on its name, so
 * such copy would never get written. The guard lives on the final object.
 */
export function withDescriptionNameGuard<S extends z.ZodRawShape>(shape: S) {
  return z
    .object(shape)
    .refine((v: Record<string, unknown>) => !(v.descriptionTr && !v.nameTr), {
      path: ["descriptionTr"],
      message: "descriptionWithoutName",
    })
    .refine((v: Record<string, unknown>) => !(v.descriptionRu && !v.nameRu), {
      path: ["descriptionRu"],
      message: "descriptionWithoutName",
    });
}

const optionalId = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Product technical spec: key/value pairs → stored as a JSON object. Keys unique. */
const attributesField = z
  .array(
    z.object({
      key: z
        .string("required")
        .trim()
        .min(1, "required")
        .max(ATTR_KEY_MAX, "tooLong")
        .refine(isStorableText, "invalid"),
      value: z
        .string("required")
        .trim()
        .min(1, "required")
        .max(ATTR_VALUE_MAX, "tooLong")
        .refine(isStorableText, "invalid"),
    }),
  )
  .max(ATTR_MAX_PAIRS, "tooLong")
  .refine((pairs) => new Set(pairs.map((p) => p.key)).size === pairs.length, {
    message: "duplicateAttributeKey",
  })
  .optional()
  .default([]);

// ---- Manufacturer ----------------------------------------------------------
// `logoAssetId` (Story 4.5) selects a media-library image; the action maps it to
// `logoUrl = /api/media/<id>` (or null). Optional — a manufacturer may have no logo.
export const manufacturerCreateSchema = withDescriptionNameGuard({
  slug: slugField,
  logoAssetId: optionalId,
  ...nameDescriptionShape,
});
export const manufacturerUpdateSchema = withDescriptionNameGuard({
  id: idField,
  logoAssetId: optionalId,
  ...nameDescriptionShape,
});
export type ManufacturerCreateInput = z.infer<typeof manufacturerCreateSchema>;
export type ManufacturerUpdateInput = z.infer<typeof manufacturerUpdateSchema>;

// ---- Category (name-only + optional self-referential parent) ---------------
export const categoryCreateSchema = z.object({
  slug: slugField,
  parentId: optionalId,
  ...nameOnlyShape,
});
export const categoryUpdateSchema = z.object({
  id: idField,
  parentId: optionalId,
  ...nameOnlyShape,
});
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

// ---- Series (name-only + required manufacturer) ----------------------------
export const seriesCreateSchema = z.object({
  slug: slugField,
  manufacturerId: idField,
  ...nameOnlyShape,
});
export const seriesUpdateSchema = z.object({
  id: idField,
  manufacturerId: idField,
  ...nameOnlyShape,
});
export type SeriesCreateInput = z.infer<typeof seriesCreateSchema>;
export type SeriesUpdateInput = z.infer<typeof seriesUpdateSchema>;

// ---- Product ---------------------------------------------------------------
// `slug` is create-only (Decision 2: stored, matched-exactly, not renamed in
// 4.3). Everything in `productEditableShape` can change on an edit.
const productEditableShape = {
  model: requiredText(NAME_MAX),
  manufacturerId: idField,
  categoryId: idField,
  seriesId: optionalId,
  status: z.enum(["draft", "published"]),
  attributes: attributesField,
  // Story 4.5: a media-library image selection. Stored as a provisional
  // reference (`Product.media = [assetId]`); the public product-detail media
  // render + a richer gallery shape are deferred to a Product-media story (no
  // reader exists today — see deferred-work).
  mediaAssetId: optionalId,
} as const;
export const productCreateSchema = withDescriptionNameGuard({
  slug: slugField,
  ...productEditableShape,
  ...nameDescriptionShape,
});
export const productUpdateSchema = withDescriptionNameGuard({
  id: idField,
  ...productEditableShape,
  ...nameDescriptionShape,
});
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;

// ---- Translation-row assembly ---------------------------------------------

export interface NameTranslationRow {
  locale: "en" | "tr" | "ru";
  name: string;
}
export interface NameDescriptionTranslationRow extends NameTranslationRow {
  description: string | null;
}

/** Build name-only translation rows: EN always, TR/RU only when named. */
export function nameRows(input: {
  nameEn: string;
  nameTr?: string;
  nameRu?: string;
}): NameTranslationRow[] {
  const rows: NameTranslationRow[] = [{ locale: "en", name: input.nameEn }];
  if (input.nameTr) rows.push({ locale: "tr", name: input.nameTr });
  if (input.nameRu) rows.push({ locale: "ru", name: input.nameRu });
  return rows;
}

/** Build name+description translation rows: EN always, TR/RU only when named. */
export function nameDescriptionRows(input: {
  nameEn: string;
  descriptionEn?: string;
  nameTr?: string;
  descriptionTr?: string;
  nameRu?: string;
  descriptionRu?: string;
}): NameDescriptionTranslationRow[] {
  const rows: NameDescriptionTranslationRow[] = [
    { locale: "en", name: input.nameEn, description: input.descriptionEn ?? null },
  ];
  if (input.nameTr)
    rows.push({ locale: "tr", name: input.nameTr, description: input.descriptionTr ?? null });
  if (input.nameRu)
    rows.push({ locale: "ru", name: input.nameRu, description: input.descriptionRu ?? null });
  return rows;
}

/** Attribute pairs → a plain JSON object for the `attributes` JSONB column. */
export function attributesObject(
  pairs: { key: string; value: string }[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of pairs ?? []) out[key] = value;
  return out;
}
