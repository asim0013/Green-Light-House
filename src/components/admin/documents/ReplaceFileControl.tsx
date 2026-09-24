"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { inputClass, submitButtonClass } from "@/components/admin/catalog/CatalogFormKit";
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_MEGABYTES } from "@/server/admin/documents/validate";

/**
 * Replace a document's file (Story 4.6, FR25a). Posts the new file to
 * `/api/admin/documents/<id>/replace`; the public download URL below is UNCHANGED
 * by a replace — only the bytes and the version change. Kept separate from the
 * metadata form because it is a distinct, irreversible-ish action.
 */
export function ReplaceFileControl({
  id,
  downloadHref,
  version,
}: {
  id: string;
  downloadHref: string;
  version: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  async function onReplace() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose a PDF to upload.");
      return;
    }
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    let res: Response;
    try {
      res = await fetch(`/api/admin/documents/${id}/replace`, { method: "POST", body: fd });
    } catch {
      setError("Replace failed. Try again.");
      return;
    }
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: { message?: string };
    } | null;
    if (!res.ok || !body?.ok) {
      setError(body?.error?.message ?? "Replace failed.");
      return;
    }
    if (fileRef.current) fileRef.current.value = "";
    start(() => router.refresh());
  }

  return (
    <div className="flex max-w-2xl flex-col gap-3 border-t border-border-subtle p-8">
      <h2 className="font-heading text-[16px] font-bold text-ink">Current file (v{version})</h2>
      <p className="text-[13px] text-ink-2">
        Public URL (stable across versions):{" "}
        <a href={downloadHref} className="font-mono text-[12px] underline">
          {downloadHref}
        </a>
      </p>
      <label
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2"
        htmlFor="replace"
      >
        Replace file (keeps the URL, bumps the version)
      </label>
      <input
        id="replace"
        ref={fileRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className={inputClass}
      />
      <p className="text-[12px] text-muted">
        Up to {DOCUMENT_MAX_MEGABYTES} MB. Virus-scanned before storage.
      </p>
      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {error}
        </p>
      )}
      <div>
        <button type="button" onClick={onReplace} disabled={pending} className={submitButtonClass}>
          {pending ? "Replacing…" : "Replace file"}
        </button>
      </div>
    </div>
  );
}
