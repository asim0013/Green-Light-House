import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DocumentFile } from "@/server/repositories/document";

/**
 * The download handler's response contract (Story 2.3, added in its review).
 *
 * WHY THIS FILE EXISTS: at 169163f the route had NO coverage outside the e2e
 * suite — and that suite gated itself on a probe which, when the handler broke,
 * skipped instead of failing. Every branch below was either wrong or unproven at
 * review time:
 *   - a storage OUTAGE answered 404, telling crawlers a live document was gone;
 *   - a malformed `mime` column 500'd out of the uniform-404 design;
 *   - a non-PDF mime produced a `.bin` filename the OS cannot open;
 *   - `must-revalidate` shipped with no validator and no conditional handling.
 *
 * The repository and storage layers are mocked: this asserts the HANDLER's
 * decisions, not Prisma's or S3's.
 */

const getDocumentBySlug = vi.fn<(slug: string) => Promise<DocumentFile | null>>();
const getObjectStream = vi.fn();
const headObject = vi.fn();

vi.mock("@/server/repositories/document", () => ({
  getDocumentBySlug: (slug: string) => getDocumentBySlug(slug),
}));

vi.mock("@/lib/storage", () => ({
  getObjectStream: (key: string) => getObjectStream(key),
  headObject: (key: string) => headObject(key),
}));

const { GET } = await import("./route");

const PDF: DocumentFile = {
  slug: "fd-9500-datasheet",
  fileKey: "docs/fd-9500-datasheet-v1.pdf",
  mime: "application/pdf",
  sizeBytes: 602,
};

const ETAG = '"97cff40f43e2afcfe5ee626cec4de2b9"';
const LAST_MODIFIED = new Date("2026-08-21T17:20:45.000Z");

function body(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("%PDF-1.4\n"));
      controller.close();
    },
  });
}

function call(slug: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/documents/${slug}`, { headers }), {
    params: Promise.resolve({ slug }),
  });
}

beforeEach(() => {
  getDocumentBySlug.mockReset();
  getObjectStream.mockReset();
  headObject.mockReset();
  getObjectStream.mockResolvedValue({
    stream: body(),
    contentLength: 602,
    etag: ETAG,
    lastModified: LAST_MODIFIED,
  });
});

describe("the 404 surface — one response, four ways in", () => {
  it("404s a malformed slug without ever touching the database", async () => {
    const res = await call("A&B junk");
    expect(res.status).toBe(404);
    expect(getDocumentBySlug).not.toHaveBeenCalled();
  });

  it("404s an unknown slug", async () => {
    getDocumentBySlug.mockResolvedValue(null);
    expect((await call("zz-not-a-document")).status).toBe(404);
  });

  it("404s a row whose object is gone, and says so in the log", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    getObjectStream.mockResolvedValue(null);
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await call("fd-9500-datasheet")).status).toBe(404);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("object missing"));
    error.mockRestore();
  });

  it("gives byte-identical bodies for unknown and malformed — nothing to enumerate with", async () => {
    getDocumentBySlug.mockResolvedValue(null);
    const unknown = await (await call("zz-not-a-document")).text();
    const malformed = await (await call("A&B junk")).text();
    expect(unknown).toBe(malformed);
  });
});

describe("a storage OUTAGE is 503, never 404", () => {
  it("503s with Retry-After when storage throws", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    getObjectStream.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await call("fd-9500-datasheet");
    // The regression: this used to be 404, which tells a crawler the document is
    // permanently GONE and hands a visitor the broken link FR25a forbids.
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("120");
    expect(res.headers.get("cache-control")).toBe("no-store");
    error.mockRestore();
  });

  it("leaks no storage topology in the 503 body", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    getObjectStream.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    const text = await (await call("fd-9500-datasheet")).text();
    expect(text).not.toContain("9000");
    expect(text).not.toContain("ECONNREFUSED");
    expect(text.length).toBeLessThan(100);
    error.mockRestore();
  });
});

describe("headers", () => {
  it("serves the bytes with attachment headers and cache validators", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    const res = await call("fd-9500-datasheet");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="fd-9500-datasheet.pdf"',
    );
    expect(res.headers.get("content-length")).toBe("602");
    expect(res.headers.get("etag")).toBe(ETAG);
    expect(res.headers.get("last-modified")).toBe(LAST_MODIFIED.toUTCString());
  });

  it("takes the filename extension from the stored key, not the mime map", async () => {
    // A .bin filename is unopenable on Windows even when Content-Type is right.
    getDocumentBySlug.mockResolvedValue({
      ...PDF,
      slug: "fd-9500-manual",
      fileKey: "docs/fd-9500-manual-v1.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const res = await call("fd-9500-manual");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="fd-9500-manual.docx"',
    );
  });

  it("degrades a malformed mime to octet-stream instead of throwing a 500", async () => {
    // `new Headers()` throws on a value carrying CR/LF; `mime` is an
    // unconstrained nullable column, and header construction sits outside the
    // storage try/catch.
    getDocumentBySlug.mockResolvedValue({ ...PDF, mime: "application/\npdf" });
    const res = await call("fd-9500-datasheet");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("falls back to octet-stream for a NULL mime", async () => {
    getDocumentBySlug.mockResolvedValue({ ...PDF, mime: null });
    const res = await call("fd-9500-datasheet");
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });
});

describe("conditional requests — what makes must-revalidate mean anything", () => {
  it("304s a matching If-None-Match without fetching the body", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    headObject.mockResolvedValue({ contentLength: 602, etag: ETAG, lastModified: LAST_MODIFIED });

    const res = await call("fd-9500-datasheet", { "If-None-Match": ETAG });
    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe(ETAG);
    // The whole point: revalidation must not stream the object.
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it("honours the * wildcard and weak tags", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    headObject.mockResolvedValue({ contentLength: 602, etag: ETAG, lastModified: LAST_MODIFIED });

    expect((await call("fd-9500-datasheet", { "If-None-Match": "*" })).status).toBe(304);
    expect((await call("fd-9500-datasheet", { "If-None-Match": `W/${ETAG}` })).status).toBe(304);
  });

  it("serves 200 when the ETag no longer matches — the file was replaced", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    headObject.mockResolvedValue({
      contentLength: 610,
      etag: '"different"',
      lastModified: LAST_MODIFIED,
    });

    const res = await call("fd-9500-datasheet", { "If-None-Match": ETAG });
    expect(res.status).toBe(200);
    expect(getObjectStream).toHaveBeenCalled();
  });

  it("304s an If-Modified-Since at or after the object's mtime", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    headObject.mockResolvedValue({ contentLength: 602, etag: ETAG, lastModified: LAST_MODIFIED });

    const res = await call("fd-9500-datasheet", {
      "If-Modified-Since": new Date("2026-08-22T00:00:00.000Z").toUTCString(),
    });
    expect(res.status).toBe(304);
  });

  it("serves 200 for an If-Modified-Since older than the object", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    headObject.mockResolvedValue({ contentLength: 602, etag: ETAG, lastModified: LAST_MODIFIED });

    const res = await call("fd-9500-datasheet", {
      "If-Modified-Since": new Date("2020-01-01T00:00:00.000Z").toUTCString(),
    });
    expect(res.status).toBe(200);
  });

  it("503s — not 304 — when storage is down during a revalidation", async () => {
    getDocumentBySlug.mockResolvedValue(PDF);
    headObject.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    expect((await call("fd-9500-datasheet", { "If-None-Match": ETAG })).status).toBe(503);
    error.mockRestore();
  });
});

describe("the key-prefix assertion (Story 3.7b, AC9)", () => {
  it("refuses a fileKey outside docs/ — including a quarantined attachment", async () => {
    // Before this guard, "no shipped route can serve a quarantined attachment"
    // was true only because no Document row happens to point outside `docs/`.
    // `fileKey` is a plain string column an Epic 4 admin form will populate, so
    // circumstance was the only thing standing between a malware quarantine and
    // an ungated public download URL.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    getDocumentBySlug.mockResolvedValue({
      ...PDF,
      fileKey: "quarantine/6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8.pdf",
    });
    const res = await call("fd-9500-datasheet");
    expect(res.status).toBe(404);
    // Storage is never even consulted: the refusal happens before any read.
    expect(getObjectStream).not.toHaveBeenCalled();
    expect(headObject).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining("outside docs/"));
    error.mockRestore();
  });

  it("refuses prefix LOOK-ALIKES, not just foreign prefixes", async () => {
    // `startsWith` is the whole check, so the interesting cases are the ones
    // that nearly match: a sibling bucket path and a traversal-shaped key.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fileKey of ["docs-archive/x.pdf", "../docs/x.pdf", "projects/lng/hero.jpg"]) {
      getDocumentBySlug.mockResolvedValue({ ...PDF, fileKey });
      expect((await call("fd-9500-datasheet")).status, fileKey).toBe(404);
    }
    error.mockRestore();
  });

  it("still serves a legitimate docs/ key — the guard is not a blanket 404", async () => {
    // The half that proves the test above is not vacuous.
    getDocumentBySlug.mockResolvedValue(PDF);
    getObjectStream.mockResolvedValue({
      stream: body(),
      contentLength: 602,
      etag: ETAG,
      lastModified: LAST_MODIFIED,
    });
    expect((await call("fd-9500-datasheet")).status).toBe(200);
  });
});
