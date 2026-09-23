import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Media library actions (Story 4.5) — the alt-purge and the delete reference
 * guard, on top of the shared wrapper. Guard/revalidate/repo mocked; the tests
 * pin: alt edit busts `media`; delete refuses while referenced (no repo delete);
 * delete busts `media` when unreferenced.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  revalidateTags: (t: readonly string[]) => revalidateTags(t),
}));

const repo = {
  updateMediaAssetAlt: vi.fn(),
  deleteMediaAsset: vi.fn(),
  mediaAssetReferenceCounts: vi.fn(),
};
vi.mock("@/server/repositories/media", () => ({
  updateMediaAssetAlt: (...a: unknown[]) => repo.updateMediaAssetAlt(...a),
  deleteMediaAsset: (...a: unknown[]) => repo.deleteMediaAsset(...a),
  mediaAssetReferenceCounts: (...a: unknown[]) => repo.mediaAssetReferenceCounts(...a),
  // isReferenced is pure — use the real implementation.
  isReferenced: (c: Record<string, number>) => Object.values(c).some((n) => n > 0),
}));

const { updateMediaAssetAltAction, deleteMediaAssetAction } = await import("./actions");

beforeEach(() => {
  revalidateTags.mockReset();
  Object.values(repo).forEach((f) => f.mockReset());
});

describe("updateMediaAssetAltAction", () => {
  it("saves and busts the media tag", async () => {
    repo.updateMediaAssetAlt.mockResolvedValue(true);
    const r = await updateMediaAssetAltAction({ id: "a1", altEn: "Flame detector" });
    expect(r.ok).toBe(true);
    expect(repo.updateMediaAssetAlt).toHaveBeenCalled();
    expect(revalidateTags).toHaveBeenCalledWith(["media"]);
  });

  it("rejects a missing EN alt at the schema boundary (no repo write)", async () => {
    const r = await updateMediaAssetAltAction({ id: "a1", altTr: "only turkish" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("validation_failed");
      expect(r.error.details?.some((d) => d.path === "altEn")).toBe(true);
    }
    expect(repo.updateMediaAssetAlt).not.toHaveBeenCalled();
  });
});

describe("deleteMediaAssetAction", () => {
  it("refuses (in_use) while referenced and does NOT delete", async () => {
    repo.mediaAssetReferenceCounts.mockResolvedValue({
      manufacturers: 1,
      teamMembers: 0,
      projects: 0,
      products: 0,
    });
    const r = await deleteMediaAssetAction("a1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("in_use");
    expect(repo.deleteMediaAsset).not.toHaveBeenCalled();
    expect(revalidateTags).not.toHaveBeenCalled();
  });

  it("deletes and busts media when unreferenced", async () => {
    repo.mediaAssetReferenceCounts.mockResolvedValue({
      manufacturers: 0,
      teamMembers: 0,
      projects: 0,
      products: 0,
    });
    repo.deleteMediaAsset.mockResolvedValue(undefined);
    const r = await deleteMediaAssetAction("a1");
    expect(r.ok).toBe(true);
    expect(repo.deleteMediaAsset).toHaveBeenCalledWith("a1");
    expect(revalidateTags).toHaveBeenCalledWith(["media"]);
  });
});
