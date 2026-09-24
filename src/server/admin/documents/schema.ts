import { z } from "zod";
import { requiredText, optionalText, idField, slugField } from "@/server/admin/catalog/schema";

// Optional id / empty → undefined (the content-schema `optionalIdOrEmpty` pattern;
// catalog's `optionalId` is module-local, so it is re-declared here rather than exported).
const optionalId = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Admin documents schema (Story 4.6) — the Story 4.4 extension model: import the
 * catalog primitives, define this module's schemas, add any new stable error keys
 * to `CATALOG_ERROR_TEXT`. Validates the METADATA of create + edit; the file
 * itself is validated by `./validate.ts` (a File is not zod-parseable).
 *
 * `slug` is create-only (the stable public identity, FR25a). `title` is per-locale
 * (EN required, TR/RU optional — FR38/FR34a). Associations: one product, one
 * manufacturer (both optional), any industries.
 */

const TITLE_MAX = 300;

// A checkbox posts "true"/"on"/absent (route, FormData) or a real boolean (action).
const booleanFlag = z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean());

const industryIds = z.preprocess(
  (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]),
  z.array(z.string().min(1)).max(50),
);

const DOCUMENT_TYPE = z.enum(["datasheet", "certificate", "catalog", "manual", "drawing"]);

const titleShape = {
  titleEn: requiredText(TITLE_MAX),
  titleTr: optionalText(TITLE_MAX),
  titleRu: optionalText(TITLE_MAX),
} as const;

const associations = {
  type: DOCUMENT_TYPE,
  isPublic: booleanFlag,
  productId: optionalId,
  manufacturerId: optionalId,
  industryIds,
} as const;

/** Metadata for CREATE (the file is validated separately by the route). */
export const documentCreateSchema = z.object({
  slug: slugField,
  ...associations,
  ...titleShape,
});
export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;

/** Metadata for EDIT (no slug, no file). */
export const documentMetaSchema = z.object({
  id: idField,
  ...associations,
  ...titleShape,
});
export type DocumentMetaInput = z.infer<typeof documentMetaSchema>;

export interface DocumentTitleRow {
  locale: "en" | "tr" | "ru";
  title: string;
}

/** Build title rows: EN always; TR/RU only when set. */
export function documentTitleRows(input: {
  titleEn: string;
  titleTr?: string;
  titleRu?: string;
}): DocumentTitleRow[] {
  const rows: DocumentTitleRow[] = [{ locale: "en", title: input.titleEn }];
  if (input.titleTr) rows.push({ locale: "tr", title: input.titleTr });
  if (input.titleRu) rows.push({ locale: "ru", title: input.titleRu });
  return rows;
}
