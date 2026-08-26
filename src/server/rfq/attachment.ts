/**
 * RFQ attachment intake rules (Story 3.7b — FR32a, AC1/AC2/AC3).
 *
 * ONE MODULE, BOTH SIDES, like `./schema.ts`: the dropzone reads the constants
 * for its `accept` attribute and its derived constraint copy, and the endpoint
 * enforces them. A limit the client shows and the server does not enforce is a
 * suggestion; a limit the server enforces and the client does not show is a
 * trap. Both come from here.
 *
 * CLIENT-SAFE BY CONSTRUCTION: no `node:` imports, no Prisma, no env reads. The
 * byte inspection below works on `Uint8Array` and `TextDecoder` alone so this
 * file can ship in the browser bundle unchanged.
 *
 * ⚠️ WHAT THE MAGIC-BYTE CHECKS ACTUALLY PROVE (Task 0 #11 — stated honestly
 * rather than implied):
 *  - PDF and DWG are genuinely DISCRIMINATED. Their signatures are specific.
 *  - XLSX IS NOT. `.xlsx`, `.docx`, `.jar`, `.apk` and every other OPC/Java
 *    package are ZIP files with byte-identical `PK\x03\x04` headers. The
 *    `[Content_Types].xml` scan below narrows "some ZIP" to "a ZIP shaped like
 *    an OPC package" — which is strictly better than the header alone and still
 *    not proof of a spreadsheet. **ClamAV is the real gate**, and it scans
 *    archive members, which is exactly why the scan is not optional.
 * Extension is checked TOO, not instead: DWG has no universally-sent media type
 * (browsers send `application/octet-stream`), so the client `Content-Type` is
 * never consulted for anything — not for validation, not for storage.
 */

/** FR32a's ceiling. The route derives its multipart body cap from this. */
export const ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024;

/** The same number in the unit the UI says out loud (Task 0 #13's derivation). */
export const ATTACHMENT_MAX_MEGABYTES = ATTACHMENT_MAX_BYTES / (1024 * 1024);

export interface AttachmentFormat {
  /** Lowercase extension, without the dot. Also the stored key's suffix. */
  readonly extension: string;
  /** SERVER-DERIVED media type. The client's `Content-Type` is never stored. */
  readonly mime: string;
  /** What the copy calls it. Latin in all three locales, by design. */
  readonly label: string;
}

export const ATTACHMENT_FORMATS: readonly AttachmentFormat[] = [
  { extension: "pdf", mime: "application/pdf", label: "PDF" },
  {
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    label: "XLSX",
  },
  { extension: "dwg", mime: "image/vnd.dwg", label: "DWG" },
];

/** The `accept` attribute, derived — never a second hand-typed list. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_FORMATS.map((f) => `.${f.extension}`).join(",");

/** The `{formats}` value the constraint line interpolates. U+00B7, one space
 *  each side — the canvas glyph, matching `Rfq.sectionProject`'s "1 · …". */
export const ATTACHMENT_FORMAT_LIST = ATTACHMENT_FORMATS.map((f) => f.label).join(" · ");

/** A filename longer than this is refused rather than truncated. */
export const ATTACHMENT_NAME_MAX = 255;

/**
 * How far into the file the OPC container marker is looked for. Bounded on
 * purpose: an unbounded scan over a 15 MB buffer is attacker-controlled work.
 *
 * The bound is safe by CONVENTION, not by spec (3.7b review corrected an
 * overclaim here): ECMA-376 does not mandate where `[Content_Types].xml` sits
 * physically — but every mainstream writer (Excel, LibreOffice, the OOXML
 * SDKs) emits it as the first entry, so its local-file-header name lands in
 * the first few hundred bytes of any real xlsx. A legitimate file from an
 * exotic writer that buries it past 64 KB earns `fileCorrupt`, whose copy
 * says exactly the right thing: re-export it.
 */
const OPC_SCAN_BYTES = 64 * 1024;

/** The rejection keys this module can produce (Task 0 #12). `scanFailed` is the
 *  route's, not this module's — it is a scan verdict, not an intake verdict. */
export type AttachmentRejectionKey = "fileTooLarge" | "fileType" | "fileCorrupt" | "invalid";

export type AttachmentValidation =
  { ok: true; format: AttachmentFormat } | { ok: false; key: AttachmentRejectionKey };

function asciiAt(bytes: Uint8Array, offset: number, length: number): string {
  return new TextDecoder("latin1").decode(bytes.subarray(offset, offset + length));
}

/** `%PDF-` — specific enough to discriminate. */
function looksLikePdf(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 0, 5) === "%PDF-";
}

/**
 * DWG's 6-byte version string, as an EXACT ALLOWLIST — never a loose `AC`
 * prefix, which would admit any file beginning with those two letters.
 * `AC10xx` covers R13 through the current releases; the short forms are the
 * pre-R13 spellings AutoCAD still emits for legacy exports.
 */
const DWG_LEGACY_VERSIONS = ["MC0.0", "AC1.2", "AC1.3", "AC1.40", "AC1.50", "AC2.10"];

function looksLikeDwg(bytes: Uint8Array): boolean {
  const head = asciiAt(bytes, 0, 6);
  if (/^AC10\d\d$/.test(head)) return true;
  return DWG_LEGACY_VERSIONS.some((version) => head.startsWith(version));
}

/**
 * ZIP local-file-header magic PLUS a bounded search for the OPC content-types
 * part. See the module docstring for exactly how much this proves.
 */
function looksLikeXlsx(bytes: Uint8Array): boolean {
  // The ZIP local-file-header magic, compared as BYTE VALUES rather than as a
  // decoded string: two of its four bytes are C0 control characters, and every
  // attempt to write those as escapes in source has planted RAW control bytes
  // in the file instead (five incidents in this project). Numbers cannot be
  // mis-transcoded by an editor.
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
  if (!isZip) return false;
  return asciiAt(bytes, 0, OPC_SCAN_BYTES).includes("[Content_Types].xml");
}

const MAGIC_CHECKS: Record<string, (bytes: Uint8Array) => boolean> = {
  pdf: looksLikePdf,
  xlsx: looksLikeXlsx,
  dwg: looksLikeDwg,
};

/** The lowercase extension after the LAST dot, or `""` when there is none. */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot + 1).toLowerCase();
}

/**
 * Validate one attachment at intake. Order is deliberate and each step owns its
 * own key (AC3): size, then the declared type, then whether the bytes agree.
 *
 * `isStorableName` is injected rather than imported so this module stays free
 * of a cycle with `./schema.ts` — the caller passes the same predicate that
 * guards every other stored string, because `attachmentName` lands in a
 * Postgres column and a NUL byte there is the 3.2 review's 500-at-the-insert
 * class all over again.
 */
export function validateAttachment(
  filename: string,
  bytes: Uint8Array,
  isStorableName: (value: string) => boolean,
): AttachmentValidation {
  // A name we cannot store honestly is refused, never sanitized — the schema's
  // standing doctrine. Its key is the generic `invalid`: this is a bad VALUE,
  // not one of AC3's three file-shaped rejections.
  const trimmed = filename.trim();
  if (trimmed.length === 0 || trimmed.length > ATTACHMENT_NAME_MAX || !isStorableName(trimmed)) {
    return { ok: false, key: "invalid" };
  }

  if (bytes.length > ATTACHMENT_MAX_BYTES) return { ok: false, key: "fileTooLarge" };

  const extension = extensionOf(trimmed);
  const format = ATTACHMENT_FORMATS.find((candidate) => candidate.extension === extension);
  if (!format) return { ok: false, key: "fileType" };

  // Empty and magic-mismatched share `fileCorrupt`: from the buyer's side both
  // mean "this file is not the thing its name says it is", which is the
  // actionable message. `fileType` stays reserved for "we don't take that kind".
  if (bytes.length === 0 || !MAGIC_CHECKS[extension](bytes)) {
    return { ok: false, key: "fileCorrupt" };
  }

  return { ok: true, format };
}

/**
 * The quarantine key (Task 0 #9). `quarantine/` is disjoint from `docs/` and
 * `projects/` — the only two prefixes any table can produce — so no shipped
 * serving route can resolve one, and AC9's prefix assertions make that
 * structural rather than circumstantial.
 *
 * A CLEAN FILE STAYS HERE. Promotion to some `clean/` prefix would encode a
 * SECURITY state in a path STRING, the exact inversion of `project-media.ts`'s
 * reject-at-the-parse-boundary doctrine, and would need two non-atomic S3
 * operations with no reconciler. The `attachmentScanStatus` column is the
 * single source of truth for whether the file may be opened.
 *
 * ⚠️ DISCLOSED DEVIATION from the story's wording, which said `<cuid>`: no cuid
 * generator exists in this dependency tree (Prisma's `cuid()` is a DB-side
 * default, unavailable to app code) and this story adds no dependency.
 * `randomUUID` is the zero-dep primitive with the properties that actually
 * matter here — globally unique and unguessable. The ORIGINAL FILENAME NEVER
 * APPEARS IN THE KEY: it is attacker-controlled and is stored, separately, in
 * `attachmentName`.
 */
export function attachmentStorageKey(extension: string): string {
  return `quarantine/${globalThis.crypto.randomUUID()}.${extension}`;
}
