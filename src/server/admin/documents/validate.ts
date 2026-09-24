/**
 * DOCUMENT UPLOAD intake rules (Story 4.6 — FR36/FR24). Modelled on
 * `src/server/admin/media/validate.ts` and `src/server/rfq/attachment.ts`: one
 * module, both sides — the uploader reads the `accept` + constraint copy, the
 * route enforces the limits. CLIENT-SAFE (no node:/Prisma/env imports).
 *
 * PDF-ONLY for v1 (Decision D1): certificates, datasheets and catalogs are PDFs,
 * and `formatDocMeta` currently maps only `application/pdf`. The allowlist is a
 * table so a future type adds one row (+ a `formatDocMeta` label + magic check).
 *
 * The stored key is under the `docs/` prefix the stream route hard-asserts.
 */

/** Admin documents run larger than the 15 MB RFQ cap but are admin-authored (D2). */
export const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;
export const DOCUMENT_MAX_MEGABYTES = DOCUMENT_MAX_BYTES / (1024 * 1024);
export const DOCUMENT_NAME_MAX = 255;

export interface DocumentFormat {
  readonly extension: string;
  /** SERVER-DERIVED media type — the client Content-Type is never stored. */
  readonly mime: string;
  readonly magic: (bytes: Uint8Array) => boolean;
}

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + length));
}

/** `%PDF-` — specific enough to discriminate (same check as the RFQ path). */
function looksLikePdf(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, 5) === "%PDF-";
}

export const DOCUMENT_FORMATS: readonly DocumentFormat[] = [
  { extension: "pdf", mime: "application/pdf", magic: looksLikePdf },
];

export const DOCUMENT_ACCEPT = DOCUMENT_FORMATS.map((f) => `.${f.extension}`).join(",");
export const DOCUMENT_FORMAT_LABEL = "PDF";

export type DocumentRejectionKey = "invalid" | "fileTooLarge" | "unsupportedType" | "fileCorrupt";
export type DocumentValidation =
  { ok: true; format: DocumentFormat } | { ok: false; key: DocumentRejectionKey };

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Validate one uploaded document. Order mirrors the RFQ/media validators: name
 * storability (`invalid`), declared type (`unsupportedType`), size (`fileTooLarge`),
 * then whether the bytes agree (`fileCorrupt`). `isStorableName` is injected.
 */
export function validateDocumentUpload(
  filename: string,
  bytes: Uint8Array,
  isStorableName: (value: string) => boolean,
): DocumentValidation {
  const trimmed = filename.trim();
  if (trimmed.length === 0 || trimmed.length > DOCUMENT_NAME_MAX || !isStorableName(trimmed)) {
    return { ok: false, key: "invalid" };
  }
  const format = DOCUMENT_FORMATS.find((f) => f.extension === extensionOf(trimmed));
  if (!format) return { ok: false, key: "unsupportedType" };
  if (bytes.length > DOCUMENT_MAX_BYTES) return { ok: false, key: "fileTooLarge" };
  if (bytes.length === 0 || !format.magic(bytes)) return { ok: false, key: "fileCorrupt" };
  return { ok: true, format };
}

/**
 * The storage key (Story 4.6). Under `docs/` — the ONLY prefix the stream route
 * (`/api/documents/[slug]`) serves from. Scanned before store (like media); the
 * original filename never appears in the key (the public filename is slug-derived).
 */
export function documentStorageKey(extension: string): string {
  return `docs/${globalThis.crypto.randomUUID()}.${extension}`;
}
