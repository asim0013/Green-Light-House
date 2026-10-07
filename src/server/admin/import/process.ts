import type { Locale } from "@prisma/client";
import { upsertProductFromImport } from "@/server/repositories/product";
import type { RawRow } from "./parse";
import {
  REQUIRED_COLUMNS,
  parseImportRow,
  parseIndustrySlugs,
  parseAttributes,
  type ImportRowInput,
} from "./schema";
import {
  manufacturerIdsBySlug,
  categoryIdsBySlug,
  seriesIdsBySlug,
  industryIdsBySlug,
} from "./resolve";

/**
 * The bulk product-import processor (Story 4.10 — FR6). Validates each row (zod),
 * batch-resolves FK slugs → ids, and upserts by `slug` — each row in its OWN
 * transaction (`upsertProductFromImport`), so a bad row is reported and skipped
 * while good rows commit: "row-level errors WITHOUT partial corruption". A
 * missing REQUIRED column is a FILE-level error (nothing is processed) rather
 * than N identical row errors.
 */

export interface RowError {
  row: number;
  field?: string;
  key: string;
}

export interface ImportReport {
  total: number;
  created: number;
  updated: number;
  errored: number;
  /** Set when the file is unusable (missing a required column / no rows); nothing was written. */
  fileError?: string;
  errors: RowError[];
}

/** Translation rows: EN always (the anchor), TR/RU only when a name is supplied. */
function nameRows(
  d: ImportRowInput,
): { locale: Locale; name: string; description: string | null }[] {
  const rows: { locale: Locale; name: string; description: string | null }[] = [
    { locale: "en", name: d.name_en, description: d.description_en ?? null },
  ];
  if (d.name_tr)
    rows.push({ locale: "tr", name: d.name_tr, description: d.description_tr ?? null });
  if (d.name_ru)
    rows.push({ locale: "ru", name: d.name_ru, description: d.description_ru ?? null });
  return rows;
}

export async function processImport(rows: RawRow[]): Promise<ImportReport> {
  const report: ImportReport = {
    total: rows.length,
    created: 0,
    updated: 0,
    errored: 0,
    errors: [],
  };
  if (rows.length === 0) {
    report.fileError = "noRows";
    return report;
  }
  // File-level: the required columns must be present (union of keys, robust to a
  // row whose trailing cell was blank). Missing → nothing processed.
  const columns = new Set(rows.flatMap((r) => Object.keys(r)));
  const missing = REQUIRED_COLUMNS.filter((c) => !columns.has(c));
  if (missing.length > 0) {
    report.fileError = `missingColumns:${missing.join(",")}`;
    return report;
  }

  // Pass 1 — validate + parse each row (no DB).
  const valid: {
    row: number;
    data: ImportRowInput;
    industries: string[];
    attributes?: Record<string, string>;
  }[] = [];
  rows.forEach((raw, i) => {
    const row = i + 2; // header is row 1
    const parsed = parseImportRow(raw);
    if (!parsed.ok) {
      for (const e of parsed.errors) report.errors.push({ row, field: e.field, key: e.key });
      report.errored++;
      return;
    }
    const attrs = parseAttributes(parsed.data.attributes);
    if (!attrs.ok) {
      report.errors.push({ row, field: "attributes", key: attrs.key });
      report.errored++;
      return;
    }
    valid.push({
      row,
      data: parsed.data,
      industries: parseIndustrySlugs(parsed.data.industrySlugs),
      attributes: attrs.value,
    });
  });

  // Batch-resolve every referenced FK slug in one query per entity.
  const [mfr, cat, ser, ind] = await Promise.all([
    manufacturerIdsBySlug(valid.map((v) => v.data.manufacturerSlug)),
    categoryIdsBySlug(valid.map((v) => v.data.categorySlug)),
    seriesIdsBySlug(valid.flatMap((v) => (v.data.seriesSlug ? [v.data.seriesSlug] : []))),
    industryIdsBySlug(valid.flatMap((v) => v.industries)),
  ]);

  // Pass 2 — resolve FKs, then upsert each valid row atomically.
  for (const v of valid) {
    const manufacturerId = mfr.get(v.data.manufacturerSlug);
    const categoryId = cat.get(v.data.categorySlug);
    const seriesId = v.data.seriesSlug ? ser.get(v.data.seriesSlug) : undefined;
    const fkErrors: RowError[] = [];
    if (!manufacturerId)
      fkErrors.push({ row: v.row, field: "manufacturerSlug", key: "unknownManufacturer" });
    if (!categoryId) fkErrors.push({ row: v.row, field: "categorySlug", key: "unknownCategory" });
    if (v.data.seriesSlug && !seriesId)
      fkErrors.push({ row: v.row, field: "seriesSlug", key: "unknownSeries" });
    const industryIds: string[] = [];
    for (const slug of v.industries) {
      const id = ind.get(slug);
      if (!id)
        fkErrors.push({ row: v.row, field: "industrySlugs", key: `unknownIndustry:${slug}` });
      else industryIds.push(id);
    }
    if (fkErrors.length > 0) {
      report.errors.push(...fkErrors);
      report.errored++;
      continue;
    }
    try {
      const outcome = await upsertProductFromImport({
        slug: v.data.slug,
        model: v.data.model,
        manufacturerId: manufacturerId!,
        categoryId: categoryId!,
        seriesId,
        status: v.data.status,
        attributes: v.attributes,
        translations: nameRows(v.data),
        industryIds,
      });
      if (outcome === "created") report.created++;
      else report.updated++;
    } catch {
      report.errors.push({ row: v.row, key: "writeFailed" });
      report.errored++;
    }
  }

  return report;
}
