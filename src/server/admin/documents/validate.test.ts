import { describe, it, expect } from "vitest";
import { isStorableText } from "@/server/rfq/schema";
import {
  validateDocumentUpload,
  documentStorageKey,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_FORMATS,
} from "./validate";

const pdf = (len = 64) => {
  const b = new Uint8Array(Math.max(len, 5));
  b.set(new TextEncoder().encode("%PDF-"), 0);
  return b;
};
const validate = (name: string, bytes: Uint8Array) =>
  validateDocumentUpload(name, bytes, isStorableText);

describe("validateDocumentUpload", () => {
  it("accepts a real PDF within the cap", () => {
    const r = validate("en54.pdf", pdf(2048));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.format.mime).toBe("application/pdf");
  });

  it("rejects a non-pdf extension as unsupportedType (PDF-only v1)", () => {
    expect(validate("sheet.xlsx", pdf())).toEqual({ ok: false, key: "unsupportedType" });
    expect(DOCUMENT_FORMATS.map((f) => f.extension)).toEqual(["pdf"]);
  });

  it("rejects a .pdf whose bytes are not a PDF as fileCorrupt", () => {
    const notPdf = new TextEncoder().encode("this is plainly not a pdf document");
    expect(validate("fake.pdf", notPdf)).toEqual({ ok: false, key: "fileCorrupt" });
  });

  it("rejects empty and oversize", () => {
    expect(validate("a.pdf", new Uint8Array(0))).toEqual({ ok: false, key: "fileCorrupt" });
    const big = pdf(DOCUMENT_MAX_BYTES + 1);
    expect(validate("big.pdf", big)).toEqual({ ok: false, key: "fileTooLarge" });
  });

  it("rejects an unstorable filename as invalid", () => {
    expect(validate("bad" + String.fromCharCode(0) + ".pdf", pdf())).toEqual({
      ok: false,
      key: "invalid",
    });
  });
});

describe("documentStorageKey", () => {
  it("uses the docs/ prefix and the extension", () => {
    const key = documentStorageKey("pdf");
    expect(key.startsWith("docs/")).toBe(true);
    expect(key.endsWith(".pdf")).toBe(true);
  });
});
