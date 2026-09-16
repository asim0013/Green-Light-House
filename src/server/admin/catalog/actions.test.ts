import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * Catalog server actions (Story 4.3) — the domain-error MAPPING each entity's
 * action adds on top of the shared wrapper. Repos + guard + revalidate are
 * mocked; the tests pin: a duplicate-slug P2002 becomes `slug_taken`, a
 * reference count blocks a delete as `in_use`, a category cycle is rejected,
 * and a missing row on update becomes `not_found`.
 */
vi.mock("@/lib/auth/guard", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/auth/guard");
  return { ...actual, requireAdmin: () => Promise.resolve({ sub: "admin-1" }) };
});
vi.mock("@/lib/revalidate", () => ({ revalidateTags: vi.fn() }));

const repo = {
  createManufacturer: vi.fn(),
  updateManufacturerTranslations: vi.fn(),
  manufacturerReferenceCounts: vi.fn(),
  deleteManufacturer: vi.fn(),
};
vi.mock("@/server/repositories/manufacturer", () => ({
  createManufacturer: (...a: unknown[]) => repo.createManufacturer(...a),
  updateManufacturerTranslations: (...a: unknown[]) => repo.updateManufacturerTranslations(...a),
  manufacturerReferenceCounts: (...a: unknown[]) => repo.manufacturerReferenceCounts(...a),
  deleteManufacturer: (...a: unknown[]) => repo.deleteManufacturer(...a),
}));

const catRepo = {
  wouldCreateCategoryCycle: vi.fn(),
  updateCategory: vi.fn(),
};
vi.mock("@/server/repositories/category", () => ({
  wouldCreateCategoryCycle: (...a: unknown[]) => catRepo.wouldCreateCategoryCycle(...a),
  updateCategory: (...a: unknown[]) => catRepo.updateCategory(...a),
  createCategory: vi.fn(),
  categoryReferenceCounts: vi.fn(),
  deleteCategory: vi.fn(),
}));

const { createManufacturerAction, updateManufacturerAction, deleteManufacturerAction } =
  await import("./manufacturer-actions");
const { updateCategoryAction } = await import("./category-actions");

beforeEach(() => {
  Object.values(repo).forEach((f) => f.mockReset());
  Object.values(catRepo).forEach((f) => f.mockReset());
});

const validManufacturer = { slug: "bosch", nameEn: "Bosch" };

describe("manufacturer actions", () => {
  it("creates and returns the id", async () => {
    repo.createManufacturer.mockResolvedValue({ id: "m1", slug: "bosch" });
    const result = await createManufacturerAction(validManufacturer);
    expect(result).toEqual({ ok: true, data: { id: "m1" } });
    expect(repo.createManufacturer).toHaveBeenCalledWith({
      slug: "bosch",
      translations: [{ locale: "en", name: "Bosch", description: null }],
    });
  });

  it("maps a duplicate-slug P2002 to slug_taken with a field detail", async () => {
    repo.createManufacturer.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("dup", {
        code: "P2002",
        clientVersion: "6",
        meta: { target: ["slug"] },
      }),
    );
    const result = await createManufacturerAction(validManufacturer);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("slug_taken");
      expect(result.error.details).toEqual([{ path: "slug", key: "slugInvalid" }]);
    }
  });

  it("returns not_found when the row is gone on update", async () => {
    repo.updateManufacturerTranslations.mockResolvedValue(false);
    const result = await updateManufacturerAction({ id: "gone", nameEn: "X" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("not_found");
  });

  it("refuses a delete while referenced (in_use) and does not delete", async () => {
    repo.manufacturerReferenceCounts.mockResolvedValue({ series: 2, products: 3 });
    const result = await deleteManufacturerAction("m1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("in_use");
    expect(repo.deleteManufacturer).not.toHaveBeenCalled();
  });

  it("deletes when there are no references", async () => {
    repo.manufacturerReferenceCounts.mockResolvedValue({ series: 0, products: 0 });
    repo.deleteManufacturer.mockResolvedValue(undefined);
    const result = await deleteManufacturerAction("m1");
    expect(result).toEqual({ ok: true, data: { id: "m1" } });
    expect(repo.deleteManufacturer).toHaveBeenCalledWith("m1");
  });
});

describe("category action cycle guard", () => {
  it("rejects an update that would create a cycle, before writing", async () => {
    catRepo.wouldCreateCategoryCycle.mockResolvedValue(true);
    const result = await updateCategoryAction({ id: "a", parentId: "b", nameEn: "A" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("cycle");
    expect(catRepo.updateCategory).not.toHaveBeenCalled();
  });
});
