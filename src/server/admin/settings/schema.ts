import { z } from "zod";
import { requiredText, optionalText, idField } from "@/server/admin/catalog/schema";

/**
 * Admin operational-settings schemas (Story 4.8 — FR36b/FR29/FR30/FR38). Reuses
 * the Story 4.3 primitives and the stable-error-key + inline-English doctrine.
 * The server actions are authoritative.
 *
 * TWO groups:
 *  1. The `SiteSettings` singleton VALUES (contact/legal/phone/notify) — flat,
 *     all optional, `null` = "not supplied". NO approvals (code-flipped).
 *  2. The SLA process + step TEXT — per-locale, EN required (the anchor), TR/RU
 *     optional (EN fallback, FR34a). A locale row is written only when ALL its
 *     fields are supplied (the model's translation columns are non-null).
 */

const CAP_MAX = 320;

/** An optional email: `""`/absent → undefined; otherwise a valid, bounded address. */
function optionalEmail() {
  return z
    .string("invalid")
    .trim()
    .email("invalid")
    .max(CAP_MAX, "tooLong")
    .optional()
    .or(z.literal("").transform(() => undefined));
}

// ---- 1. SiteSettings values (singleton) ------------------------------------
export const siteSettingsSchema = z.object({
  contactEmail: optionalEmail(),
  contactAddress: optionalText(2000),
  legalName: optionalText(300),
  tradeRegistryNo: optionalText(200),
  taxOffice: optionalText(200),
  taxNo: optionalText(200),
  mersisNo: optionalText(200),
  phone: optionalText(40),
  phoneDisplay: optionalText(64),
  rfqNotifyTo: optionalEmail(),
});
export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;

// ---- 2. SLA text (process + steps) -----------------------------------------
const LOCALE_CAP = [
  ["En", "en"],
  ["Tr", "tr"],
  ["Ru", "ru"],
] as const;

/**
 * Build a per-locale translated shape: `${field}${Cap}`. EN fields are required
 * (the anchor — a stepper with no EN row is dropped), TR/RU optional (EN
 * fallback). Field values are bounded storable text.
 */
function translationShape(fields: readonly string[], max: number): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [cap] of LOCALE_CAP)
    for (const f of fields) shape[`${f}${cap}`] = cap === "En" ? requiredText(max) : optionalText(max);
  return shape;
}

export interface LocaleTextRow {
  locale: "en" | "tr" | "ru";
  [field: string]: string;
}

/**
 * Collect per-locale rows: EN always (required), TR/RU only when EVERY field of
 * that locale is supplied — a partial locale row would violate the model's
 * non-null translation columns, so it is dropped to the EN fallback instead.
 */
export function localeTextRows(
  input: Record<string, unknown>,
  fields: readonly string[],
): LocaleTextRow[] {
  const rows: LocaleTextRow[] = [];
  for (const [cap, locale] of LOCALE_CAP) {
    const values = fields.map((f) => (input[`${f}${cap}`] as string | undefined)?.trim() ?? "");
    const allPresent = values.every((v) => v.length > 0);
    if (locale === "en" || allPresent) {
      const row = { locale } as LocaleTextRow;
      fields.forEach((f, i) => (row[f] = values[i]));
      rows.push(row);
    }
  }
  return rows;
}

export const SLA_PROCESS_FIELDS = ["kicker", "summary"] as const;
export const SLA_STEP_FIELDS = ["badge", "title", "description"] as const;

export const slaProcessTextSchema = z.object({
  processId: idField,
  ...translationShape(SLA_PROCESS_FIELDS, 2000),
});
export type SlaProcessTextInput = z.infer<typeof slaProcessTextSchema>;

export const slaStepTextSchema = z.object({
  stepId: idField,
  ...translationShape(SLA_STEP_FIELDS, 2000),
});
export type SlaStepTextInput = z.infer<typeof slaStepTextSchema>;

/** Reorder payload: the step ids in their new order. */
export const slaReorderSchema = z.object({
  orderedStepIds: z.array(idField).min(1, "required"),
});
export type SlaReorderInput = z.infer<typeof slaReorderSchema>;
