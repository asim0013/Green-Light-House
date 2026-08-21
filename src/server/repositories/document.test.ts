import { describe, it, expect } from "vitest";
import { toCertificateListItem, type DocumentRow } from "./document";

/**
 * Pure mapping logic for the certificates read (Story 2.1).
 *
 * Worth its own coverage despite being small: on the CURRENT seed
 * `document_industries` has zero rows, so no fixture anywhere exercises a
 * POPULATED certificates block end to end. These assertions are the only proof
 * that the populated path resolves correctly at all.
 */

const EN = { locale: "en" as const, title: "ATEX Type Examination Certificate" };

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return { id: "d1", slug: "atex-type-examination", translations: [EN], ...overrides };
}

describe("toCertificateListItem", () => {
  it("uses the requested locale when present", () => {
    const item = toCertificateListItem(
      row({ translations: [EN, { locale: "tr", title: "ATEX Tip İnceleme Sertifikası" }] }),
      "tr",
    );
    expect(item.title).toBe("ATEX Tip İnceleme Sertifikası");
    expect(item.isFallback).toBe(false);
  });

  it("falls back to EN and flags it", () => {
    const item = toCertificateListItem(row(), "ru");
    expect(item.title).toBe("ATEX Type Examination Certificate");
    expect(item.isFallback).toBe(true);
  });

  it("falls back to the slug when there is no translation at all", () => {
    expect(toCertificateListItem(row({ translations: [] }), "en").title).toBe(
      "atex-type-examination",
    );
  });

  it("preserves the slug the download URL is built from (Story 2.3 delivered it)", () => {
    expect(toCertificateListItem(row(), "en").slug).toBe("atex-type-examination");
  });

  it("carries mime and sizeBytes for the format+size text, null-graceful", () => {
    const item = toCertificateListItem(row({ mime: "application/pdf", sizeBytes: 610 }), "en");
    expect(item.mime).toBe("application/pdf");
    expect(item.sizeBytes).toBe(610);
    // Rows without the fields (pre-2.3 fixtures) resolve to null, not undefined.
    const bare = toCertificateListItem(row(), "en");
    expect(bare.mime).toBeNull();
    expect(bare.sizeBytes).toBeNull();
  });
});
