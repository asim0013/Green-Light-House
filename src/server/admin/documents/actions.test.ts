import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Document actions (Story 4.6) — metadata purge + delete, on the shared wrapper.
 * Guard/revalidate/repo mocked. Pins: metadata save busts `documents`; a missing
 * EN title is rejected at the schema boundary; delete busts `documents`.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({
  revalidateTags: (t: readonly string[]) => revalidateTags(t),
}));
const repo = { updateDocumentMeta: vi.fn(), deleteDocument: vi.fn() };
vi.mock("@/server/repositories/document", () => ({
  updateDocumentMeta: (...a: unknown[]) => repo.updateDocumentMeta(...a),
  deleteDocument: (...a: unknown[]) => repo.deleteDocument(...a),
}));

const { updateDocumentMetaAction, deleteDocumentAction } = await import("./actions");

beforeEach(() => {
  revalidateTags.mockReset();
  Object.values(repo).forEach((f) => f.mockReset());
});

describe("updateDocumentMetaAction", () => {
  it("saves and busts documents", async () => {
    repo.updateDocumentMeta.mockResolvedValue(true);
    const r = await updateDocumentMetaAction({
      id: "d1",
      type: "certificate",
      isPublic: true,
      industryIds: [],
      titleEn: "ISO 9001",
    });
    expect(r.ok).toBe(true);
    expect(repo.updateDocumentMeta).toHaveBeenCalled();
    expect(revalidateTags).toHaveBeenCalledWith(["documents"]);
  });

  it("rejects a missing EN title at the schema boundary (no repo write)", async () => {
    const r = await updateDocumentMetaAction({ id: "d1", type: "catalog", isPublic: true });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("validation_failed");
      expect(r.error.details?.some((d) => d.path === "titleEn")).toBe(true);
    }
    expect(repo.updateDocumentMeta).not.toHaveBeenCalled();
  });

  it("maps a vanished document to not_found", async () => {
    repo.updateDocumentMeta.mockResolvedValue(false);
    const r = await updateDocumentMetaAction({
      id: "gone",
      type: "datasheet",
      isPublic: false,
      industryIds: [],
      titleEn: "X",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });
});

describe("deleteDocumentAction", () => {
  it("deletes and busts documents", async () => {
    repo.deleteDocument.mockResolvedValue({ fileKey: "docs/x.pdf" });
    const r = await deleteDocumentAction("d1");
    expect(r).toEqual({ ok: true, data: { id: "d1" } });
    expect(repo.deleteDocument).toHaveBeenCalledWith("d1");
    expect(revalidateTags).toHaveBeenCalledWith(["documents"]);
  });
});
