import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Lead actions (Story 4.7) — status update + erasure on the shared wrapper.
 * Guard/revalidate/repo mocked. Purge set is empty (leads have no public reader).
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  revalidateTags: (t: readonly string[]) => revalidateTags(t),
}));
const repo = { updateLeadStatus: vi.fn(), deleteLeadWithAttachment: vi.fn() };
vi.mock("@/server/repositories/lead", () => ({
  updateLeadStatus: (...a: unknown[]) => repo.updateLeadStatus(...a),
  deleteLeadWithAttachment: (...a: unknown[]) => repo.deleteLeadWithAttachment(...a),
}));

const { updateLeadStatusAction, deleteLeadAction } = await import("./actions");

beforeEach(() => {
  revalidateTags.mockReset();
  Object.values(repo).forEach((f) => f.mockReset());
});

describe("updateLeadStatusAction", () => {
  it("updates a valid status (empty purge — leads have no public reader)", async () => {
    repo.updateLeadStatus.mockResolvedValue(true);
    const r = await updateLeadStatusAction({ id: "l1", status: "quoted" });
    expect(r).toEqual({ ok: true, data: { id: "l1" } });
    expect(repo.updateLeadStatus).toHaveBeenCalledWith("l1", "quoted");
    expect(revalidateTags).toHaveBeenCalledWith([]);
  });

  it("rejects an invalid status at the schema boundary (no write)", async () => {
    const r = await updateLeadStatusAction({ id: "l1", status: "archived" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation_failed");
    expect(repo.updateLeadStatus).not.toHaveBeenCalled();
  });

  it("maps a vanished lead to not_found", async () => {
    repo.updateLeadStatus.mockResolvedValue(false);
    const r = await updateLeadStatusAction({ id: "gone", status: "closed" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});

describe("deleteLeadAction", () => {
  it("erases via deleteLeadWithAttachment (object-before-row)", async () => {
    repo.deleteLeadWithAttachment.mockResolvedValue(undefined);
    const r = await deleteLeadAction("l1");
    expect(r).toEqual({ ok: true, data: { id: "l1" } });
    expect(repo.deleteLeadWithAttachment).toHaveBeenCalledWith("l1");
  });
});
