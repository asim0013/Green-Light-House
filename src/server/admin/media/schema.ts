import { z } from "zod";
import { requiredText, optionalText, idField } from "@/server/admin/catalog/schema";

/**
 * Media library admin schema (Story 4.5). Follows the Story 4.4 extension model:
 * import the catalog primitives, define this module's schemas, and add any new
 * stable error keys to `CATALOG_ERROR_TEXT` (done in `CatalogFormKit`), NOT to the
 * pinned `CATALOG_ERROR_KEYS` tuple.
 *
 * Only the ALT metadata is edited through a form (`withAdminMutation`). Upload is
 * a multipart route (`POST /api/admin/media`) whose validation lives in
 * `./validate.ts` — a file part is not a zod-parseable value.
 *
 * `alt` is per-locale accessibility copy. EN is REQUIRED (WCAG 2.1 AA / NFR3 — an
 * image with no alt in the fallback locale is inaccessible); TR/RU optional. A row
 * is written iff its alt is present, so clearing a tab removes that locale's alt.
 */

const ALT_MAX = 300;
const LOCALE_CAP = [
  ["En", "en"],
  ["Tr", "tr"],
  ["Ru", "ru"],
] as const;

export const mediaAltSchema = z.object({
  id: idField,
  altEn: requiredText(ALT_MAX),
  altTr: optionalText(ALT_MAX),
  altRu: optionalText(ALT_MAX),
});
export type MediaAltInput = z.infer<typeof mediaAltSchema>;

export interface MediaAltRow {
  locale: "en" | "tr" | "ru";
  alt: string;
}

/** Build alt rows: EN always (required); TR/RU only when set. */
export function mediaAltRows(input: Record<string, unknown>): MediaAltRow[] {
  const rows: MediaAltRow[] = [];
  for (const [cap, locale] of LOCALE_CAP) {
    const alt = input[`alt${cap}`] as string | undefined;
    if (!alt) continue;
    rows.push({ locale, alt });
  }
  return rows;
}
