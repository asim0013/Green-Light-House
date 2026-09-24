import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LeadExportRow } from "@/server/repositories/lead";

/**
 * The CSV export route (Story 4.7, AC5). Guard/repo mocked; the pure `leadsToCsv`
 * runs for real. Pins: 401 without a session; 200 `text/csv` with a filename and
 * the serialized rows; the `?status=` filter is passed through to the repo.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: vi.fn() };
});
const repo = { listLeadsForExport: vi.fn() };
vi.mock("@/server/repositories/lead", () => ({
  listLeadsForExport: (...a: unknown[]) => repo.listLeadsForExport(...a),
}));

const { requireAdmin, AuthRequiredError } = await import("@/lib/auth/guard");
const { GET } = await import("./route");

const row: LeadExportRow = {
  reference: "GLH-RFQ-2001",
  createdAt: new Date("2026-09-24T10:00:00.000Z"),
  status: "new",
  source: "product",
  company: "Acme",
  name: "Aylin",
  email: "a@example.com",
  phone: null,
  country: null,
  locale: null,
  industry: null,
  equipment: "FD-9500",
  projectDetails: null,
  quantities: null,
  timeline: null,
  consent: true,
  consentAt: null,
  consentVersion: null,
  attachmentName: null,
  attachmentScanStatus: null,
  notifiedAt: null,
  confirmationSentAt: null,
  deliveryFailureReason: null,
};

beforeEach(() => {
  vi.mocked(requireAdmin)
    .mockReset()
    .mockResolvedValue({ sub: "admin-1" } as never);
  repo.listLeadsForExport.mockReset().mockResolvedValue([row]);
});

describe("GET leads export", () => {
  it("401s without an admin session", async () => {
    vi.mocked(requireAdmin).mockRejectedValue(new AuthRequiredError());
    const res = await GET(new Request("http://x/en/admin/leads/export"));
    expect(res.status).toBe(401);
    expect(repo.listLeadsForExport).not.toHaveBeenCalled();
  });

  it("returns a CSV attachment with the serialized rows", async () => {
    const res = await GET(new Request("http://x/en/admin/leads/export"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("leads-");
    const body = await res.text();
    expect(body).toContain("Reference,Received,Status");
    expect(body).toContain("GLH-RFQ-2001");
  });

  it("passes a valid ?status= filter to the repo (and ignores junk)", async () => {
    await GET(new Request("http://x/en/admin/leads/export?status=quoted"));
    expect(repo.listLeadsForExport).toHaveBeenCalledWith("quoted");
    await GET(new Request("http://x/en/admin/leads/export?status=bogus"));
    expect(repo.listLeadsForExport).toHaveBeenLastCalledWith(undefined);
  });
});
