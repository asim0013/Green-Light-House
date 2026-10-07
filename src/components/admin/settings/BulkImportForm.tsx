"use client";

import { useState } from "react";
import { submitButtonClass } from "@/components/admin/catalog/CatalogFormKit";
import type { ImportReport } from "@/server/admin/import/process";

/**
 * Bulk product import uploader (Story 4.10 — FR6). Posts an .xlsx/.csv to the
 * import route (a full multipart POST, same origin) and renders the returned
 * per-row report. `import type` only from the server module — erased at build, so
 * no Prisma reaches the client bundle.
 */
export function BulkImportForm({ locale }: { locale: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch(`/${locale}/admin/settings/import`, { method: "POST", body });
      const json = (await res.json().catch(() => null)) as
        { ok: true; report: ImportReport } | { ok: false; key: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json && !json.ok ? json.key : `error ${res.status}`);
        return;
      }
      setReport(json.report);
    } catch {
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-4 p-8">
      <p className="text-[13px] text-ink-2">
        Upload a product audit sheet (.xlsx or .csv) to create/update products in bulk. Rows are
        matched by <code>slug</code> and upserted idempotently; each row is applied atomically and
        any problems are reported below without a partial write. Required columns:{" "}
        <code>slug, model, manufacturerSlug, categorySlug, name_en</code>; optional:{" "}
        <code>
          seriesSlug, status, name_tr, name_ru, description_en/tr/ru, industrySlugs (;), attributes
          (JSON)
        </code>
        . Manufacturer/category/series/industry must already exist (referenced by slug).
      </p>
      <div className="flex items-center gap-3">
        <input
          type="file"
          name="file"
          accept=".xlsx,.csv"
          required
          className="text-[13px] text-ink"
        />
        <button type="submit" disabled={busy} className={submitButtonClass}>
          {busy ? "Importing…" : "Import"}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          Import failed: {error}
        </p>
      )}

      {report && (
        <div className="flex flex-col gap-2 rounded border border-border-subtle p-4 text-[13px]">
          {report.fileError ? (
            <p role="alert" className="text-[#B42318]">
              File rejected: {report.fileError}
            </p>
          ) : (
            <p className="text-ink">
              {report.total} rows · <span className="font-semibold">{report.created}</span> created
              · <span className="font-semibold">{report.updated}</span> updated ·{" "}
              <span className={report.errored ? "font-semibold text-[#B42318]" : "font-semibold"}>
                {report.errored}
              </span>{" "}
              errored
            </p>
          )}
          {report.errors.length > 0 && (
            <ul className="flex flex-col gap-1 font-mono text-[12px] text-ink-2">
              {report.errors.map((e, i) => (
                <li key={i}>
                  Row {e.row}
                  {e.field ? ` · ${e.field}` : ""}: {e.key}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
