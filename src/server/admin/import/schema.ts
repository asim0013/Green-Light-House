import { z } from "zod";
import { requiredText, optionalText, slugField } from "@/server/admin/catalog/schema";
import type { RawRow } from "./parse";

/**
 * The canonical PRODUCT import row (Story 4.10 — FR6). Story 4.10 DEFINES this
 * template (OQ3's exact audit columns are TBD; only the file format — Excel/CSV —
 * is confirmed). Reuses the 4.3 zod primitives so import validation matches the
 * CRUD's rules exactly. FK parents are named by SLUG and resolved separately
 * (`resolve.ts`); the schema only validates the row's own shape.
 *
 * `name_en` is the required anchor (a product with no EN name is invalid, per the
 * catalog rule); TR/RU fall back to EN (FR34a). `status` defaults to `draft` (an
 * audit import should never auto-publish; the admin reviews then publishes).
 * `attributes` is a JSON-object string; `industrySlugs` is `;`-separated.
 */

/** The required header columns — absence of any is a FILE-level error, not N row errors. */
export const REQUIRED_COLUMNS = [
  "slug",
  "model",
  "manufacturerSlug",
  "categorySlug",
  "name_en",
] as const;

const NAME_MAX = 200;
const DESC_MAX = 4000;

const optionalSlug = z.preprocess(
  (v) => (v === "" || v == null ? undefined : v),
  slugField.optional(),
);

export const importRowSchema = z.object({
  slug: slugField,
  model: requiredText(NAME_MAX),
  manufacturerSlug: slugField,
  categorySlug: slugField,
  seriesSlug: optionalSlug,
  // blank / missing → draft; otherwise must be a real status.
  status: z.preprocess(
    (v) => (v === "" || v == null ? "draft" : v),
    z.enum(["draft", "published"]),
  ),
  name_en: requiredText(NAME_MAX),
  name_tr: optionalText(NAME_MAX),
  name_ru: optionalText(NAME_MAX),
  description_en: optionalText(DESC_MAX),
  description_tr: optionalText(DESC_MAX),
  description_ru: optionalText(DESC_MAX),
  industrySlugs: optionalText(2000),
  attributes: optionalText(8000),
});
export type ImportRowInput = z.infer<typeof importRowSchema>;

export interface RowFieldError {
  field?: string;
  key: string;
}

/** Validate one raw row. Returns the typed row or the per-field errors (no throw). */
export function parseImportRow(
  raw: RawRow,
): { ok: true; data: ImportRowInput } | { ok: false; errors: RowFieldError[] } {
  const result = importRowSchema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const errors = result.error.issues.map((i) => ({
    field: i.path.map(String).join(".") || undefined,
    key: i.message,
  }));
  return { ok: false, errors };
}

/** Split the `;`-separated industry-slugs cell into trimmed, non-empty slugs. */
export function parseIndustrySlugs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Parse the optional `attributes` JSON-object string into a `Record<string,string>`.
 * `undefined` means the cell was blank → the caller PRESERVES existing attributes.
 * An invalid/non-object/non-string-valued payload is a row error.
 */
export function parseAttributes(
  raw: string | undefined,
): { ok: true; value: Record<string, string> | undefined } | { ok: false; key: string } {
  if (!raw) return { ok: true, value: undefined };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, key: "attributesInvalidJson" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, key: "attributesNotObject" };
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== "string") return { ok: false, key: "attributesValuesMustBeStrings" };
    out[k] = v;
  }
  return { ok: true, value: out };
}
