import ExcelJS from "exceljs";
import { Readable } from "node:stream";

/**
 * Spreadsheet parsing for the bulk product import (Story 4.10 — FR6). PURE: a
 * buffer in, header-mapped string rows out — no DB, no request — so it is
 * unit-testable and the route just feeds it the (already virus-scanned) bytes.
 *
 * Uses `exceljs` for BOTH formats (architecture:87): `.xlsx` via `xlsx.load`,
 * `.csv` via `csv.read` over a stream. The FIRST worksheet is the data sheet; row
 * 1 is the header (column names, order-INDEPENDENT); every non-empty row below
 * becomes a `{ header: cellString }` record. Column/row VALIDATION is the
 * processor's job (per-row zod) — this layer only shapes the grid into records.
 */

export type ImportFileKind = "xlsx" | "csv";

/** A raw spreadsheet row keyed by header name; every value stringified + trimmed. */
export type RawRow = Record<string, string>;

/** A structurally-unparseable file (no worksheet, or no header cells). */
export class ImportParseError extends Error {
  constructor(readonly key: string) {
    super(key);
    this.name = "ImportParseError";
  }
}

/**
 * exceljs cell values are a union; reduce each to a trimmed string for zod.
 *
 * ⚠️ AN ERROR-VALUED CELL YIELDS `""`, NOT `"[object Object]"`. A direct error
 * cell (`{ error: "#N/A" }`) or a formula whose result errored
 * (`{ formula, result: { error: "#DIV/0!" } }`) has no usable text — stringifying
 * it would write the literal `"[object Object]"` into whatever column it occupies
 * (model/slug/name/attributes), silently importing garbage. Returning `""`
 * instead means a REQUIRED field then fails validation (a row error) rather than
 * persisting junk. Every unknown object shape also returns `""` — this function
 * must never leak `"[object Object]"`. Exported for direct unit testing (exceljs
 * cannot easily author an error cell via `writeBuffer`).
 */
export function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; error?: unknown; richText?: { text: string }[] };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (v.error !== undefined) return ""; // a direct Excel error cell
    if (v.result !== undefined && v.result !== null) {
      if (v.result instanceof Date) return v.result.toISOString();
      if (typeof v.result === "object") return ""; // an errored formula result (or other object)
      return String(v.result).trim(); // a numeric/string/boolean formula result
    }
    if (typeof v.text === "string") return v.text.trim(); // hyperlink / shared-string text
  }
  return ""; // never "[object Object]"
}

/**
 * Parse a scanned spreadsheet buffer into header-mapped rows. Throws
 * `ImportParseError` only for a structurally-unusable file; anything about
 * column contents is left to per-row validation downstream.
 */
export async function parseSpreadsheet(buffer: Uint8Array, kind: ImportFileKind): Promise<RawRow[]> {
  const workbook = new ExcelJS.Workbook();
  let sheet: ExcelJS.Worksheet | undefined;

  if (kind === "xlsx") {
    // exceljs types want a Node Buffer; the route hands us a Uint8Array.
    await workbook.xlsx.load(Buffer.from(buffer) as unknown as ExcelJS.Buffer);
    sheet = workbook.worksheets[0];
  } else {
    sheet = await workbook.csv.read(Readable.from(Buffer.from(buffer)));
  }

  if (!sheet) throw new ImportParseError("emptyFile");

  const headerRow = sheet.getRow(1);
  const headers: string[] = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, col) => {
    headers[col] = cellToString(cell.value);
  });
  if (headers.filter(Boolean).length === 0) throw new ImportParseError("noHeader");

  const rows: RawRow[] = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const record: RawRow = {};
    let any = false;
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      const key = headers[col];
      if (!key) return;
      const value = cellToString(cell.value);
      record[key] = value;
      if (value) any = true;
    });
    if (any) rows.push(record); // skip fully-blank rows
  }
  return rows;
}
