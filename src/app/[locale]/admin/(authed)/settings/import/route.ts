import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { scanBuffer } from "@/lib/clamav";
import { parseSpreadsheet, ImportParseError, type ImportFileKind } from "@/server/admin/import/parse";
import { processImport } from "@/server/admin/import/process";

/**
 * `POST /[locale]/admin/settings/import` — bulk product import (Story 4.10, FR6).
 * Origin-checked + `requireAdmin` (the proxy also gates /[locale]/admin). The
 * uploaded .xlsx/.csv is size-capped, VIRUS-SCANNED before it is parsed (the
 * media route's FR32a discipline — a spreadsheet can carry a payload), parsed
 * with exceljs, then processed row-by-row. Returns the import report as JSON.
 *
 * HTTP: 403 bad origin · 401 unauth · 400 no file · 422 too big / bad type /
 * scan-fail / unparseable · 200 + report (which may itself carry row errors or a
 * `fileError` — those are data outcomes, not transport failures).
 */
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — a product-audit sheet is small

function originAllowed(origin: string | null): boolean {
  if (origin === null) return true; // non-browser clients carry no Origin
  try {
    return new URL(origin).origin === new URL(siteOrigin()).origin;
  } catch {
    return false;
  }
}

function fail(key: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, key }, { status });
}

function kindFromName(name: string): ImportFileKind | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".csv")) return "csv";
  return null;
}

export async function POST(request: Request) {
  if (!originAllowed(request.headers.get("origin"))) return fail("forbidden", 403);

  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthRequiredError) return fail("unauthorized", 401);
    throw error;
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("fileRequired", 400);
  if (file.size > MAX_BYTES) return fail("fileTooLarge", 422);

  const kind = kindFromName(file.name);
  if (!kind) return fail("unsupportedFormat", 422);

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Scan BEFORE parsing — an infected byte never reaches the parser (FR32a).
  const scan = await scanBuffer(bytes);
  if (scan.status !== "clean") return fail("scanFailed", 422);

  let rows;
  try {
    rows = await parseSpreadsheet(bytes, kind);
  } catch (error) {
    if (error instanceof ImportParseError) return fail(`parse:${error.key}`, 422);
    throw error;
  }

  const report = await processImport(rows);
  return NextResponse.json({ ok: true, report }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
