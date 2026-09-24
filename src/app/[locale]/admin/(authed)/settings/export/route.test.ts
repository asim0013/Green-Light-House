import { describe, it, expect, vi, beforeEach } from "vitest";
import type { DatasetExport } from "@/server/admin/backup/export";

/**
 * The full-dataset JSON export route (Story 4.9, FR36c). Guard + assembler mocked.
 * Pins: 401 without a session (assembler never called); 200 `application/json`
 * with a `glh-backup-` filename and a parseable body carrying `meta` + `data`.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: vi.fn() };
});
const backup = { buildDatasetExport: vi.fn() };
vi.mock("@/server/admin/backup/export", () => ({
  buildDatasetExport: () => backup.buildDatasetExport(),
}));

const { requireAdmin, AuthRequiredError } = await import("@/lib/auth/guard");
const { GET } = await import("./route");

const fakeExport = {
  meta: { formatVersion: 1, exportedAt: "2026-09-24T10:00:00.000Z", generator: "glh", note: "x" },
  data: { leads: [{ reference: "GLH-RFQ-2001" }], siteSettings: null },
} as unknown as DatasetExport;

beforeEach(() => {
  vi.mocked(requireAdmin)
    .mockReset()
    .mockResolvedValue({ sub: "admin-1" } as never);
  backup.buildDatasetExport.mockReset().mockResolvedValue(fakeExport);
});

describe("GET settings export", () => {
  it("401s without an admin session and never assembles the dataset", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthRequiredError());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(backup.buildDatasetExport).not.toHaveBeenCalled();
  });

  it("returns a JSON backup attachment with a parseable body", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("content-disposition")).toContain("glh-backup-");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const parsed = JSON.parse(await res.text());
    expect(parsed.meta.formatVersion).toBe(1);
    expect(parsed.data.leads[0].reference).toBe("GLH-RFQ-2001");
  });
});
