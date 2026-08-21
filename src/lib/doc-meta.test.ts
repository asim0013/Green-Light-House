import { describe, it, expect } from "vitest";
import { formatDocMeta } from "./doc-meta";

/**
 * The format+size label (Story 2.3). Both inputs are nullable columns and the
 * rule is graceful omission — the seeded rows carried NULL metadata for two
 * stories, so the null matrix is the REAL input space, not an edge case.
 */
describe("formatDocMeta", () => {
  it("renders format and size when both are known", () => {
    expect(formatDocMeta("application/pdf", 602)).toBe("PDF · 602 B");
  });

  it("scales units: bytes, KB, MB, GB", () => {
    expect(formatDocMeta("application/pdf", 512)).toBe("PDF · 512 B");
    expect(formatDocMeta("application/pdf", 204800)).toBe("PDF · 200.0 KB");
    expect(formatDocMeta("application/pdf", 3 * 1024 * 1024)).toBe("PDF · 3.0 MB");
    // Without a GB branch this rendered "2560.0 MB" (2.3 review).
    expect(formatDocMeta("application/pdf", 2.5 * 1024 * 1024 * 1024)).toBe("PDF · 2.5 GB");
  });

  it("holds each unit right up to its boundary", () => {
    expect(formatDocMeta(null, 1023)).toBe("1023 B");
    expect(formatDocMeta(null, 1024)).toBe("1.0 KB");
    expect(formatDocMeta(null, 1024 * 1024 - 1)).toBe("1024.0 KB");
    expect(formatDocMeta(null, 1024 * 1024)).toBe("1.0 MB");
  });

  it("omits the size gracefully when unknown — never fakes one", () => {
    expect(formatDocMeta("application/pdf", null)).toBe("PDF");
  });

  it("omits the format when the mime is unknown or unmapped", () => {
    expect(formatDocMeta(null, 602)).toBe("602 B");
    expect(formatDocMeta("application/x-unknown", 602)).toBe("602 B");
  });

  it("returns null when nothing is known, so callers skip the element", () => {
    expect(formatDocMeta(null, null)).toBeNull();
  });

  it("rejects zero and non-finite sizes rather than rendering '0 B' or 'NaN'", () => {
    expect(formatDocMeta(null, 0)).toBeNull();
    expect(formatDocMeta(null, NaN)).toBeNull();
    expect(formatDocMeta("application/pdf", Infinity)).toBe("PDF");
  });
});
