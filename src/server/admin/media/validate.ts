import type { MediaKind } from "@prisma/client";

/**
 * MEDIA UPLOAD intake rules (Story 4.5 — FR37). Modelled on
 * `src/server/rfq/attachment.ts`: one module, both sides — the uploader reads the
 * `accept` attribute and constraint copy, the route enforces the limits.
 *
 * CLIENT-SAFE BY CONSTRUCTION: no `node:` imports, no Prisma, no env reads. Byte
 * inspection uses `Uint8Array`/`TextDecoder` only, so it ships in the browser
 * bundle unchanged.
 *
 * ⚠️ SVG IS DELIBERATELY ABSENT from the image allowlist — a stored-XSS boundary,
 * not a preference (same rule as `project-media.ts:SAFE_IMAGE_MIME`): same-origin
 * delivery of an SVG that carries `<script>` is XSS against every admin session.
 *
 * ⚠️ MAGIC BYTES vs the SCAN. The signatures below discriminate the real formats
 * (JPEG/PNG/WebP/AVIF/MP4/WebM headers are specific), but ClamAV (`scanBuffer` in
 * the route) remains the real malware gate and runs before any upload. Extension
 * is checked too; the client `Content-Type` is never consulted or stored.
 */

/** Image ceiling — matches FR32a's attachment cap (the one stated number). */
export const MEDIA_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
/**
 * Video ceiling. Larger than images, but bounded so a clean scan completes inside
 * ClamAV's 20s per-connection deadline (`SCAN_DEADLINE_MS`) rather than timing out
 * into a `failed` verdict. 50 MB scans well within the deadline on this stack.
 */
export const MEDIA_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const MEDIA_IMAGE_MAX_MEGABYTES = MEDIA_IMAGE_MAX_BYTES / (1024 * 1024);
export const MEDIA_VIDEO_MAX_MEGABYTES = MEDIA_VIDEO_MAX_BYTES / (1024 * 1024);

export interface MediaFormat {
  /** Lowercase extension without the dot. Also the stored key's suffix. */
  readonly extension: string;
  /** SERVER-DERIVED media type. The client's `Content-Type` is never stored. */
  readonly mime: string;
  readonly kind: MediaKind;
  /** Bytes agree with the declared type. */
  readonly magic: (bytes: Uint8Array) => boolean;
}

export const MEDIA_NAME_MAX = 255;

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + length));
}

/** JPEG: FF D8 FF. */
function looksLikeJpeg(b: Uint8Array): boolean {
  return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}
/** PNG: 89 50 4E 47 0D 0A 1A 0A. Compared as byte values (control bytes). */
function looksLikePng(b: Uint8Array): boolean {
  return (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  );
}
/** WebP: "RIFF" at 0, "WEBP" at 8. */
function looksLikeWebp(b: Uint8Array): boolean {
  return asciiAt(b, 0, 4) === "RIFF" && asciiAt(b, 8, 4) === "WEBP";
}
/** ISO-BMFF `ftyp` box at offset 4, with an allowlisted major brand. */
function ftypBrandIn(b: Uint8Array, brands: readonly string[]): boolean {
  if (asciiAt(b, 4, 4) !== "ftyp") return false;
  const major = asciiAt(b, 8, 4);
  return brands.some((brand) => major.startsWith(brand));
}
/** AVIF: ftyp with an AVIF brand. */
function looksLikeAvif(b: Uint8Array): boolean {
  return ftypBrandIn(b, ["avif", "avis", "mif1", "msf1"]);
}
/** MP4: ftyp with a common MP4/ISO brand. */
function looksLikeMp4(b: Uint8Array): boolean {
  return ftypBrandIn(b, ["isom", "iso2", "mp41", "mp42", "avc1", "dash", "M4V "]);
}
/** WebM/Matroska: EBML header 1A 45 DF A3. */
function looksLikeWebm(b: Uint8Array): boolean {
  return b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3;
}

/** The upload allowlist. SVG is deliberately absent (see module docstring). */
export const MEDIA_FORMATS: readonly MediaFormat[] = [
  { extension: "jpg", mime: "image/jpeg", kind: "image", magic: looksLikeJpeg },
  { extension: "jpeg", mime: "image/jpeg", kind: "image", magic: looksLikeJpeg },
  { extension: "png", mime: "image/png", kind: "image", magic: looksLikePng },
  { extension: "webp", mime: "image/webp", kind: "image", magic: looksLikeWebp },
  { extension: "avif", mime: "image/avif", kind: "image", magic: looksLikeAvif },
  { extension: "mp4", mime: "video/mp4", kind: "video", magic: looksLikeMp4 },
  { extension: "webm", mime: "video/webm", kind: "video", magic: looksLikeWebm },
];

/** `accept` attribute, derived — never a second hand-typed list. */
export const MEDIA_ACCEPT = MEDIA_FORMATS.map((f) => `.${f.extension}`).join(",");
export const MEDIA_IMAGE_LABEL = "JPG · PNG · WebP · AVIF";
export const MEDIA_VIDEO_LABEL = "MP4 · WebM";

export type MediaRejectionKey = "invalid" | "fileTooLarge" | "unsupportedType" | "fileCorrupt";

export type MediaValidation =
  { ok: true; format: MediaFormat } | { ok: false; key: MediaRejectionKey };

/** The lowercase extension after the LAST dot, or `""` when there is none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Validate one uploaded media file. Order mirrors `validateAttachment`: name
 * storability (bad VALUE → `invalid`), then size (per-kind cap), then declared
 * type (`unsupportedType`), then whether the bytes agree (`fileCorrupt`).
 * `isStorableName` is injected to avoid a cycle with `./schema.ts`.
 */
export function validateMediaUpload(
  filename: string,
  bytes: Uint8Array,
  isStorableName: (value: string) => boolean,
): MediaValidation {
  const trimmed = filename.trim();
  if (trimmed.length === 0 || trimmed.length > MEDIA_NAME_MAX || !isStorableName(trimmed)) {
    return { ok: false, key: "invalid" };
  }

  const extension = extensionOf(trimmed);
  const format = MEDIA_FORMATS.find((f) => f.extension === extension);
  if (!format) return { ok: false, key: "unsupportedType" };

  const cap = format.kind === "video" ? MEDIA_VIDEO_MAX_BYTES : MEDIA_IMAGE_MAX_BYTES;
  if (bytes.length > cap) return { ok: false, key: "fileTooLarge" };

  if (bytes.length === 0 || !format.magic(bytes)) return { ok: false, key: "fileCorrupt" };

  return { ok: true, format };
}

/**
 * The storage key (Story 4.5). `media/` is PUBLIC-SERVED and disjoint from
 * `docs/`, `projects/` and `quarantine/`, so the `/api/media/[id]` route's prefix
 * assertion is structural. Unlike the RFQ path, media is scanned BEFORE storage
 * and only clean bytes are ever written, so there is no quarantine round-trip and
 * no scan-status path encoding. Original filename never appears in the key
 * (attacker-controlled; stored separately as `originalName`).
 */
export function mediaStorageKey(extension: string): string {
  return `media/${globalThis.crypto.randomUUID()}.${extension}`;
}
