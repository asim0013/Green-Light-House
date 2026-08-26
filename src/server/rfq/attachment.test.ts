import { describe, it, expect } from "vitest";
import {
  validateAttachment,
  extensionOf,
  attachmentStorageKey,
  ATTACHMENT_ACCEPT,
  ATTACHMENT_FORMAT_LIST,
  ATTACHMENT_FORMATS,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_MEGABYTES,
  ATTACHMENT_NAME_MAX,
} from "./attachment";
import { isStorableText } from "./schema";
import {
  cleanPdf,
  cleanXlsx,
  cleanDwg,
  plainZip,
  eicarPdf,
} from "../../../scripts/attachment-fixtures";

/**
 * Intake validation (Story 3.7b, AC3).
 *
 * THESE TESTS FEED INVALID FILES, not just valid ones. A suite that only proves
 * "a real PDF is accepted" leaves the entire rejection surface — the part that
 * exists for security — unexercised. The sharpest case is `plainZip()` named
 * `.xlsx`: a REAL ZIP with the right magic bytes and the right extension, which
 * only the OPC container scan can reject. A fake that failed on its extension
 * would prove nothing about the magic-byte layer at all.
 */

const validate = (name: string, bytes: Uint8Array) =>
  validateAttachment(name, bytes, isStorableText);

describe("extensionOf", () => {
  it("takes the LAST dot, lowercases, and refuses the degenerate shapes", () => {
    expect(extensionOf("bill-of-quantities.XLSX")).toBe("xlsx");
    expect(extensionOf("spec.v2.final.pdf")).toBe("pdf");
    expect(extensionOf("noextension")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
    // A dotfile has no extension — the dot at index 0 is not a separator.
    expect(extensionOf(".pdf")).toBe("");
  });
});

describe("validateAttachment — accepts the three real formats", () => {
  const accepted: [string, string, Buffer][] = [
    ["pdf", "datasheet.pdf", cleanPdf()],
    ["xlsx", "bill-of-quantities.xlsx", cleanXlsx()],
    ["dwg", "site-plan.dwg", cleanDwg()],
  ];

  it.each(accepted)("accepts a real %s and returns the SERVER-derived mime", (ext, name, bytes) => {
    const result = validate(name, bytes);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format.extension).toBe(ext);
    // The stored mime comes from the format table, never from the browser.
    expect(result.format.mime).toBe(ATTACHMENT_FORMATS.find((f) => f.extension === ext)!.mime);
  });

  it("accepts every DWG version in the allowlist, and only those", () => {
    for (const version of ["AC1015", "AC1018", "AC1024", "AC1032", "MC0.0", "AC1.50"]) {
      expect(validate("plan.dwg", cleanDwg(version)).ok, version).toBe(true);
    }
    // A LOOSE `AC` prefix would admit these; the exact allowlist does not.
    for (const impostor of ["ACME01", "AC2050", "AC0000"]) {
      expect(validate("plan.dwg", cleanDwg(impostor)).ok, impostor).toBe(false);
    }
  });

  it("is case-insensitive on the extension — buyers send .PDF", () => {
    expect(validate("DATASHEET.PDF", cleanPdf()).ok).toBe(true);
  });
});

describe("validateAttachment — each rejection carries its OWN key (AC3)", () => {
  it("fileTooLarge: one byte over the ceiling", () => {
    // Exactly AT the ceiling is accepted; the boundary is `>`, not `>=`. A
    // fixture one byte under and one byte over pins which side is which.
    const atLimit = Buffer.concat([
      cleanPdf(),
      Buffer.alloc(ATTACHMENT_MAX_BYTES - cleanPdf().length, 0x20),
    ]);
    expect(atLimit.length).toBe(ATTACHMENT_MAX_BYTES);
    expect(validate("huge.pdf", atLimit).ok).toBe(true);
    expect(validate("huge.pdf", Buffer.concat([atLimit, Buffer.from("x")]))).toEqual({
      ok: false,
      key: "fileTooLarge",
    });
  });

  it("fileType: an extension we do not take, whatever the bytes are", () => {
    expect(validate("macro.docx", cleanXlsx())).toEqual({ ok: false, key: "fileType" });
    expect(validate("payload.exe", cleanPdf())).toEqual({ ok: false, key: "fileType" });
    expect(validate("noextension", cleanPdf())).toEqual({ ok: false, key: "fileType" });
  });

  it("fileCorrupt: THE DISGUISE CASE — a real ZIP named .xlsx that is not OPC", () => {
    // Magic bytes alone accept this: it genuinely begins with the ZIP local
    // file header. Only the `[Content_Types].xml` scan rejects it. This is the
    // single most load-bearing assertion in the file — deleting the container
    // scan turns it red and nothing else does.
    expect(validate("bill-of-quantities.xlsx", plainZip())).toEqual({
      ok: false,
      key: "fileCorrupt",
    });
  });

  it("fileCorrupt: bytes that contradict the extension, in both directions", () => {
    expect(validate("spec.pdf", cleanXlsx())).toEqual({ ok: false, key: "fileCorrupt" });
    expect(validate("book.xlsx", cleanPdf())).toEqual({ ok: false, key: "fileCorrupt" });
    expect(validate("plan.dwg", cleanPdf())).toEqual({ ok: false, key: "fileCorrupt" });
  });

  it("fileCorrupt: an empty file is never `clean by default`", () => {
    expect(validate("spec.pdf", new Uint8Array(0))).toEqual({ ok: false, key: "fileCorrupt" });
  });

  it("invalid: a filename this stack cannot store is REFUSED, never sanitized", () => {
    // `attachmentName` is a Postgres column. A NUL in it dies inside
    // prisma.lead.create — the exact 500-at-the-insert class the 3.2 review
    // fixed for every OTHER string field. The control characters are built by
    // char code: writing them as escapes in source is what has repeatedly
    // planted RAW control bytes in this repository.
    const nul = String.fromCharCode(0);
    const bidiOverride = String.fromCharCode(0x202e);
    expect(validate(`spec${nul}.pdf`, cleanPdf())).toEqual({ ok: false, key: "invalid" });
    // The classic filename spoof: RTL override makes "gpj.exe" render as "exe.jpg".
    expect(validate(`invoice${bidiOverride}fdp.exe.pdf`, cleanPdf())).toEqual({
      ok: false,
      key: "invalid",
    });
    expect(validate("   ", cleanPdf())).toEqual({ ok: false, key: "invalid" });
    expect(validate(`${"a".repeat(ATTACHMENT_NAME_MAX)}.pdf`, cleanPdf())).toEqual({
      ok: false,
      key: "invalid",
    });
  });

  it("size is checked BEFORE type — an oversize .exe reports the size, not the type", () => {
    // Ordering matters for the message the buyer reads. Both are true; the
    // first one hit is the one that names an actionable cause.
    const oversize = Buffer.alloc(ATTACHMENT_MAX_BYTES + 1, 0x20);
    expect(validate("payload.exe", oversize)).toEqual({ ok: false, key: "fileTooLarge" });
  });
});

describe("the intake layer does NOT pretend to be the scanner", () => {
  it("a valid PDF carrying malware passes VALIDATION — that is the design", () => {
    // Written down as an assertion so nobody reads the validator as a security
    // boundary. It is a shape check; ClamAV is the gate (Task 0 #11). If this
    // ever returned `ok: false`, the EICAR e2e would stop reaching clamd and
    // would be proving intake rejection instead of detection — AC13's trap.
    expect(validate("spec.pdf", eicarPdf()).ok).toBe(true);
  });
});

describe("derived constants — one source, no second hand-typed list", () => {
  it("accept, format list and megabytes all derive from the format table", () => {
    expect(ATTACHMENT_ACCEPT).toBe(".pdf,.xlsx,.dwg");
    expect(ATTACHMENT_FORMAT_LIST).toBe("PDF · XLSX · DWG");
    expect(ATTACHMENT_MAX_MEGABYTES).toBe(15);
    // The separator is U+00B7 with one space each side (the canvas glyph),
    // asserted by code point so a look-alike cannot pass.
    expect(ATTACHMENT_FORMAT_LIST.charCodeAt(4)).toBe(0x00b7);
  });
});

describe("attachmentStorageKey", () => {
  it("lands under quarantine/, keeps the extension, and never carries the filename", () => {
    const key = attachmentStorageKey("pdf");
    expect(key).toMatch(/^quarantine\/[0-9a-f-]{36}\.pdf$/);
    expect(attachmentStorageKey("pdf")).not.toBe(key);
  });

  it("is disjoint from every prefix a shipped serving route can resolve", () => {
    // `docs/` and `projects/` are the only two prefixes any table produces.
    // AC9 turns this into a structural guarantee at the routes themselves.
    const key = attachmentStorageKey("xlsx");
    expect(key.startsWith("docs/")).toBe(false);
    expect(key.startsWith("projects/")).toBe(false);
  });
});
