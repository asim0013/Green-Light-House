/**
 * The "format + size" text for document links (Story 2.3) — EXPERIENCE.md's a11y
 * floor: "datasheet links state format + size in text". `PDF · 1.2 MB`.
 *
 * The unit floor is BYTES, not KB: `formatDocMeta("application/pdf", 602)` is
 * `PDF · 602 B` (the 2.3 fixtures are ~600-byte PDFs). The docstring used to
 * advertise `0.6 KB`, a string this function cannot produce.
 *
 * Both inputs are NULLABLE columns, and the rule is GRACEFUL OMISSION: render
 * whatever is real, never fake a size (the seeded rows had NULL metadata for two
 * stories — a helper that invented values would have shipped lies). Returns null
 * when neither is known, so callers can skip the element entirely.
 *
 * Language-neutral by design (machine data: format initialisms and byte units are
 * not translated), which is why this is a lib function and not a message key.
 */
const FORMAT_BY_MIME: Record<string, string> = {
  "application/pdf": "PDF",
};

export function formatDocMeta(mime: string | null, sizeBytes: number | null): string | null {
  const format = mime ? (FORMAT_BY_MIME[mime] ?? null) : null;
  const size =
    sizeBytes !== null && Number.isFinite(sizeBytes) && sizeBytes > 0 ? humanSize(sizeBytes) : null;

  if (format && size) return `${format} · ${size}`;
  return format ?? size;
}

function humanSize(bytes: number): string {
  // GB before MB: without this branch a multi-gigabyte file renders as
  // "2560.0 MB" — technically true, unreadable (2.3 review).
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}
