"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  errorText,
  inputClass,
  submitButtonClass,
} from "@/components/admin/catalog/CatalogFormKit";
import {
  MEDIA_ACCEPT,
  MEDIA_IMAGE_MAX_MEGABYTES,
  MEDIA_VIDEO_MAX_MEGABYTES,
} from "@/server/admin/media/validate";

/**
 * Media uploader (Story 4.5, AC2). Posts a multipart form to
 * `POST /api/admin/media` (which scans then stores then persists), then refreshes
 * the list. A stable error `key` from the route is mapped to copy via `errorText`.
 * The `accept` attribute is derived from the same allowlist the server enforces.
 */
export function MediaUploader() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError(errorText("fileRequired") ?? "Choose a file.");
      return;
    }

    let res: Response;
    try {
      res = await fetch("/api/admin/media", { method: "POST", body: data });
    } catch {
      setError(errorText("storageUnavailable") ?? "Upload failed.");
      return;
    }
    const body = (await res.json().catch(() => null)) as { ok?: boolean; key?: string } | null;
    if (!res.ok || !body?.ok) {
      setError(errorText(body?.key) ?? "Upload failed.");
      return;
    }
    form.reset();
    startTransition(() => router.refresh());
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded border border-border-subtle p-4"
    >
      <label
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2"
        htmlFor="file"
      >
        Upload media
      </label>
      <input id="file" name="file" type="file" accept={MEDIA_ACCEPT} className={inputClass} />
      <input
        name="alt"
        type="text"
        placeholder="Alt text (English) — optional now, editable later"
        className={inputClass}
      />
      <p className="text-[12px] text-muted">
        Images up to {MEDIA_IMAGE_MAX_MEGABYTES} MB (JPG, PNG, WebP, AVIF); video up to{" "}
        {MEDIA_VIDEO_MAX_MEGABYTES} MB (MP4, WebM). Files are virus-scanned before storage.
      </p>
      {error && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {error}
        </p>
      )}
      <div>
        <button type="submit" disabled={pending} className={submitButtonClass}>
          {pending ? "Uploading…" : "Upload"}
        </button>
      </div>
    </form>
  );
}
