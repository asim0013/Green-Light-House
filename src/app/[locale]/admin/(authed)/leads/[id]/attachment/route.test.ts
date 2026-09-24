import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The authenticated lead-attachment download route (Story 4.7, AC4) — the FIRST
 * reader of the `quarantine/` prefix. Guard/repo/storage mocked. Pins: 401 without
 * a session; 404 for absent/non-clean (via the repo's clean-gate) and for a
 * non-quarantine key (the route's own assertion); 200 + a VALID Content-Disposition
 * for a clean object; and — the review regression — a CR/LF-bearing buyer filename
 * does NOT crash the header build.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: vi.fn() };
});
const repo = { getServableLeadAttachment: vi.fn() };
vi.mock("@/server/repositories/lead", () => ({
  getServableLeadAttachment: (...a: unknown[]) => repo.getServableLeadAttachment(...a),
}));
const storage = { getObjectStream: vi.fn() };
vi.mock("@/lib/storage", () => ({
  getObjectStream: (...a: unknown[]) => storage.getObjectStream(...a),
}));

const { requireAdmin, AuthRequiredError } = await import("@/lib/auth/guard");
const { GET } = await import("./route");

const call = (id = "l1") => GET(new Request("http://x/"), { params: Promise.resolve({ id }) });
const oneByteStream = () =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new Uint8Array([0x25]));
      c.close();
    },
  });

beforeEach(() => {
  vi.mocked(requireAdmin)
    .mockReset()
    .mockResolvedValue({ sub: "admin-1" } as never);
  repo.getServableLeadAttachment.mockReset();
  storage.getObjectStream.mockReset();
});

describe("GET lead attachment", () => {
  it("401s without an admin session", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthRequiredError());
    const res = await call();
    expect(res.status).toBe(401);
    expect(repo.getServableLeadAttachment).not.toHaveBeenCalled();
  });

  it("404s when the attachment is absent / not clean (repo gate)", async () => {
    repo.getServableLeadAttachment.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it("404s a key outside quarantine/ (defensive assertion) — never fetches it", async () => {
    repo.getServableLeadAttachment.mockResolvedValue({
      storageKey: "docs/evil.pdf",
      name: "x.pdf",
      mime: "application/pdf",
    });
    expect((await call()).status).toBe(404);
    expect(storage.getObjectStream).not.toHaveBeenCalled();
  });

  it("streams a clean quarantine object as an attachment", async () => {
    repo.getServableLeadAttachment.mockResolvedValue({
      storageKey: "quarantine/abc.pdf",
      name: "spec.pdf",
      mime: "application/pdf",
    });
    storage.getObjectStream.mockResolvedValue({ stream: oneByteStream(), contentLength: 1 });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain('filename="spec.pdf"');
  });

  it("does NOT crash on a CR/LF-bearing buyer filename (review regression)", async () => {
    // Build the CR/LF via char codes — a raw \r\n in source would be rewritten to bytes.
    const crlf = String.fromCharCode(13, 10);
    repo.getServableLeadAttachment.mockResolvedValue({
      storageKey: "quarantine/abc.pdf",
      name: `evil${crlf}foo.pdf`,
      mime: "application/pdf",
    });
    storage.getObjectStream.mockResolvedValue({ stream: oneByteStream(), contentLength: 1 });
    const res = await call();
    expect(res.status).toBe(200);
    const cd = res.headers.get("content-disposition") ?? "";
    expect(cd).not.toContain(crlf); // no header split
    expect(cd).toContain('filename="evilfoo.pdf"'); // control chars stripped in the ascii fallback
  });

  it("503s when storage is unreachable", async () => {
    repo.getServableLeadAttachment.mockResolvedValue({
      storageKey: "quarantine/abc.pdf",
      name: "spec.pdf",
      mime: "application/pdf",
    });
    storage.getObjectStream.mockRejectedValue(new Error("s3 down"));
    expect((await call()).status).toBe(503);
  });
});
