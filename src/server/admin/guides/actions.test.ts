import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Selection-guide actions (Story 4.11). Guard/revalidate/repo mocked. Proves the
 * schema boundary (EN required, section EN required), the `guides` purge, the
 * section → sort mapping, and not_found on a vanished guide.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
const revalidateTags = vi.fn();
vi.mock("@/lib/revalidate", () => ({ revalidateTags: (t: readonly string[]) => revalidateTags(t) }));
const repo = { createGuide: vi.fn(), updateGuide: vi.fn(), deleteGuide: vi.fn() };
vi.mock("@/server/repositories/selection-guide", () => ({
  createGuide: (...a: unknown[]) => repo.createGuide(...a),
  updateGuide: (...a: unknown[]) => repo.updateGuide(...a),
  deleteGuide: (...a: unknown[]) => repo.deleteGuide(...a),
}));

const { createGuideAction, updateGuideAction, deleteGuideAction } = await import("./actions");

const enGuide = {
  status: "published",
  translations: [{ locale: "en", title: "Choosing detectors", intro: "Intro", metaDescription: null }],
  sections: [{ translations: [{ locale: "en", heading: "Step 1", body: "Body" }] }],
  productIds: ["p1", "p2"],
  categoryIds: [],
};

beforeEach(() => {
  revalidateTags.mockReset();
  Object.values(repo).forEach((f) => f.mockReset());
});

describe("createGuideAction", () => {
  it("creates a valid guide, maps sections to sort order, purges `guides`", async () => {
    repo.createGuide.mockResolvedValue({ id: "g1", slug: "choosing-detectors" });
    const r = await createGuideAction({ slug: "choosing-detectors", ...enGuide });
    expect(r).toEqual({ ok: true, data: { id: "g1" } });
    expect(repo.createGuide).toHaveBeenCalledWith(
      "choosing-detectors",
      expect.objectContaining({
        status: "published",
        sections: [{ sort: 0, translations: [{ locale: "en", heading: "Step 1", body: "Body" }] }],
        productIds: ["p1", "p2"],
      }),
    );
    expect(revalidateTags).toHaveBeenCalledWith(["guides"]);
  });

  it("rejects a guide whose translations lack EN (no write)", async () => {
    const r = await createGuideAction({
      slug: "x",
      ...enGuide,
      translations: [{ locale: "tr", title: "T", intro: null, metaDescription: null }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("validation_failed");
    expect(repo.createGuide).not.toHaveBeenCalled();
  });

  it("rejects a section missing EN (no write)", async () => {
    const r = await createGuideAction({
      slug: "x",
      ...enGuide,
      sections: [{ translations: [{ locale: "tr", heading: "H", body: "B" }] }],
    });
    expect(r.ok).toBe(false);
    expect(repo.createGuide).not.toHaveBeenCalled();
  });
});

describe("updateGuideAction", () => {
  it("maps a vanished guide to not_found", async () => {
    repo.updateGuide.mockResolvedValue(false);
    const r = await updateGuideAction({ id: "gone", ...enGuide });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("not_found");
  });

  it("updates and purges `guides`", async () => {
    repo.updateGuide.mockResolvedValue(true);
    const r = await updateGuideAction({ id: "g1", ...enGuide });
    expect(r).toEqual({ ok: true, data: { id: "g1" } });
    expect(revalidateTags).toHaveBeenCalledWith(["guides"]);
  });
});

describe("deleteGuideAction", () => {
  it("deletes and purges `guides`", async () => {
    repo.deleteGuide.mockResolvedValue(undefined);
    const r = await deleteGuideAction("g1");
    expect(r).toEqual({ ok: true, data: { id: "g1" } });
    expect(repo.deleteGuide).toHaveBeenCalledWith("g1");
    expect(revalidateTags).toHaveBeenCalledWith(["guides"]);
  });
});
