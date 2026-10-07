// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * /api/health (production launch). Mocked stores: the contract is the status code,
 * the per-check verdicts, no caching, and NO error detail leaking to the public.
 */
const db = vi.hoisted(() => ({
  main: vi.fn(async () => [{ "?column?": 1 }]),
  leads: vi.fn(async () => [{ last_value: BigInt(2000) }]),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: () => db.main() },
  leadsDb: { $queryRaw: () => db.leads() },
}));

const { GET } = await import("./route");

describe("GET /api/health", () => {
  beforeEach(() => {
    db.main.mockClear().mockImplementation(async () => [{ "?column?": 1 }]);
    db.leads.mockClear().mockImplementation(async () => [{ last_value: BigInt(2000) }]);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("200 + ok when both stores answer, and is never cached", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({ status: "ok", checks: { database: "ok", leads: "ok" } });
    expect(db.main).toHaveBeenCalledOnce();
    expect(db.leads).toHaveBeenCalledOnce();
  });

  it("503 when the catalog database is down", async () => {
    db.main.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "fail", checks: { database: "fail", leads: "ok" } });
  });

  it("503 when the leads store is unmigrated (no lead_reference_seq) — and leaks no detail", async () => {
    db.leads.mockRejectedValue(
      new Error('relation "lead_reference_seq" does not exist at db-ru.internal'),
    );
    const res = await GET();
    expect(res.status).toBe(503);
    const text = JSON.stringify(await res.json());
    expect(text).toContain('"leads":"fail"');
    // Public endpoint: no error message, hostname or relation name.
    expect(text).not.toMatch(/ECONNREFUSED|does not exist|internal|lead_reference_seq/);
  });
});
