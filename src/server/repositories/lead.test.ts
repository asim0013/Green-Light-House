import { describe, it, expect, vi, beforeEach } from "vitest";
import { PENDING_MAX_AGE_MS } from "@/lib/lead-attachment";

/**
 * Unit tests for the lead repository's Story 3.7b additions (added in the 3.7b
 * review — the review found `expireStalePendingScans` shipped with ZERO tests
 * while AC11 demanded the transition be "tested and negative-proven"; only the
 * READER derivation in `lead-attachment.ts` had been proven).
 *
 * Prisma and storage are MOCKED at the module boundary (the route.test.ts
 * recipe): vitest loads `.env`, so unmocked clients here would touch the LIVE
 * database and bucket. What these tests pin is the repository's DECISIONS —
 * the cutoff arithmetic, the stamped columns, the delete ordering — not
 * Prisma's ability to run an UPDATE.
 */

const updateMany = vi.fn();
const findUnique = vi.fn();
const deleteLead = vi.fn();
const deleteObject = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    lead: {
      updateMany: (args: unknown) => updateMany(args),
      findUnique: (args: unknown) => findUnique(args),
      delete: (args: unknown) => deleteLead(args),
    },
  },
}));

vi.mock("@/lib/storage", () => ({
  deleteObject: (key: string) => deleteObject(key),
}));

const { expireStalePendingScans, deleteLeadWithAttachment } = await import("./lead");

beforeEach(() => {
  updateMany.mockReset();
  findUnique.mockReset();
  deleteLead.mockReset();
  deleteObject.mockReset();
  updateMany.mockResolvedValue({ count: 0 });
  deleteLead.mockResolvedValue(undefined);
  deleteObject.mockResolvedValue(undefined);
});

describe("expireStalePendingScans (AC11's stored-state half)", () => {
  const NOW = new Date("2026-08-27T12:00:00.000Z");

  it("targets EXACTLY pending rows older than the threshold, from the injected `now`", async () => {
    await expireStalePendingScans(NOW);
    expect(updateMany).toHaveBeenCalledTimes(1);
    const args = updateMany.mock.calls[0][0] as {
      where: { attachmentScanStatus: string; createdAt: { lt: Date } };
      data: Record<string, unknown>;
    };
    expect(args.where.attachmentScanStatus).toBe("pending");
    // The cutoff arithmetic, pinned to the millisecond: `now - PENDING_MAX_AGE_MS`.
    // Breaking the subtraction (a sign flip, a wrong constant) reddens this.
    expect(args.where.createdAt.lt.getTime()).toBe(NOW.getTime() - PENDING_MAX_AGE_MS);
  });

  it("flips to `failed` — the fail-safe direction — and stamps attachmentScannedAt with `now`", async () => {
    await expireStalePendingScans(NOW);
    const args = updateMany.mock.calls[0][0] as { data: Record<string, unknown> };
    // `failed`, NEVER `clean`: the one state this system must not drift into is
    // offering a download for a file nothing ever scanned.
    expect(args.data).toEqual({ attachmentScanStatus: "failed", attachmentScannedAt: NOW });
  });

  it("logs the bracketed [rfq-attach] line when rows were expired, stays silent at zero", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    updateMany.mockResolvedValue({ count: 3 });
    expect(await expireStalePendingScans(NOW)).toBe(3);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("[rfq-attach]"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("3"));

    warn.mockClear();
    updateMany.mockResolvedValue({ count: 0 });
    expect(await expireStalePendingScans(NOW)).toBe(0);
    // A no-op sweep must not spam the log — silence is the steady state.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("deleteLeadWithAttachment (AC10's erasure ordering)", () => {
  it("deletes the OBJECT before the ROW — the whole point of the primitive", async () => {
    // Row-first leaves an object no row references: unfindable, therefore
    // un-erasable. The order is the contract Story 4.7 builds on.
    const order: string[] = [];
    findUnique.mockResolvedValue({ attachmentKey: "quarantine/abc.pdf" });
    deleteObject.mockImplementation(async () => {
      order.push("object");
    });
    deleteLead.mockImplementation(async () => {
      order.push("row");
    });
    await deleteLeadWithAttachment("lead-1");
    expect(order).toEqual(["object", "row"]);
    expect(deleteObject).toHaveBeenCalledWith("quarantine/abc.pdf");
  });

  it("a failing object delete KEEPS the row and propagates — no false success", async () => {
    findUnique.mockResolvedValue({ attachmentKey: "quarantine/abc.pdf" });
    deleteObject.mockRejectedValue(new Error("AccessDenied"));
    await expect(deleteLeadWithAttachment("lead-1")).rejects.toThrow("AccessDenied");
    // A half-done erasure that reports success is the failure mode the
    // ordering exists to prevent.
    expect(deleteLead).not.toHaveBeenCalled();
  });

  it("a lead with NO attachment skips storage entirely; a missing lead is a no-op", async () => {
    findUnique.mockResolvedValue({ attachmentKey: null });
    await deleteLeadWithAttachment("lead-2");
    expect(deleteObject).not.toHaveBeenCalled();
    expect(deleteLead).toHaveBeenCalledTimes(1);

    deleteLead.mockClear();
    findUnique.mockResolvedValue(null);
    await deleteLeadWithAttachment("gone");
    expect(deleteLead).not.toHaveBeenCalled();
  });
});
