// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The bulk-import route (Story 4.10). Guard / scan / parse / process mocked. Pins
 * the status matrix: 403 bad origin, 401 unauth (nothing scanned), 400 no file,
 * 422 scan-fail (nothing parsed), 422 unsupported extension, 200 + report.
 */
vi.mock("@/lib/seo", () => ({ siteOrigin: () => "https://glh.example" }));
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: vi.fn() };
});
const clamav = { scanBuffer: vi.fn() };
vi.mock("@/lib/clamav", () => ({ scanBuffer: (...a: unknown[]) => clamav.scanBuffer(...a) }));
const parse = { parseSpreadsheet: vi.fn() };
vi.mock("@/server/admin/import/parse", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/server/admin/import/parse");
  return { ...actual, parseSpreadsheet: (...a: unknown[]) => parse.parseSpreadsheet(...a) };
});
const proc = { processImport: vi.fn() };
vi.mock("@/server/admin/import/process", () => ({
  processImport: (...a: unknown[]) => proc.processImport(...a),
}));

const { requireAdmin, AuthRequiredError } = await import("@/lib/auth/guard");
const { POST } = await import("./route");

function req(file?: File, origin?: string): Request {
  const form = new FormData();
  if (file) form.set("file", file);
  const headers: Record<string, string> = {};
  if (origin) headers.origin = origin;
  return new Request("http://glh.example/en/admin/settings/import", {
    method: "POST",
    body: form,
    headers,
  });
}
const xlsx = () => new File(["data"], "products.xlsx");

beforeEach(() => {
  vi.mocked(requireAdmin)
    .mockReset()
    .mockResolvedValue({ sub: "admin-1" } as never);
  clamav.scanBuffer.mockReset().mockResolvedValue({ status: "clean" });
  parse.parseSpreadsheet.mockReset().mockResolvedValue([{ slug: "a" }]);
  proc.processImport
    .mockReset()
    .mockResolvedValue({ total: 1, created: 1, updated: 0, errored: 0, errors: [] });
});

describe("POST settings import", () => {
  it("403s a cross-origin request before doing anything", async () => {
    const res = await POST(req(xlsx(), "https://evil.example"));
    expect(res.status).toBe(403);
    expect(requireAdmin).not.toHaveBeenCalled();
  });

  it("401s without an admin session and never scans", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthRequiredError());
    const res = await POST(req(xlsx()));
    expect(res.status).toBe(401);
    expect(clamav.scanBuffer).not.toHaveBeenCalled();
  });

  it("400s when no file is supplied", async () => {
    const res = await POST(req());
    expect(res.status).toBe(400);
  });

  it("422s an unsupported extension", async () => {
    const res = await POST(req(new File(["x"], "notes.txt")));
    expect(res.status).toBe(422);
    expect(clamav.scanBuffer).not.toHaveBeenCalled();
  });

  it("422s a non-clean scan and never parses", async () => {
    clamav.scanBuffer.mockResolvedValue({ status: "infected" });
    const res = await POST(req(xlsx()));
    expect(res.status).toBe(422);
    expect(parse.parseSpreadsheet).not.toHaveBeenCalled();
    expect(proc.processImport).not.toHaveBeenCalled();
  });

  it("200s with the import report on a clean, parseable upload", async () => {
    const res = await POST(req(xlsx()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, report: { created: 1, errored: 0 } });
  });
});
