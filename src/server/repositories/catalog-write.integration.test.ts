// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createManufacturer,
  updateManufacturerTranslations,
  getManufacturerForEdit,
  manufacturerReferenceCounts,
  deleteManufacturer,
} from "./manufacturer";
import {
  createCategory,
  wouldCreateCategoryCycle,
  updateCategory,
  categoryReferenceCounts,
} from "./category";
import { createSeries, deleteSeries } from "./series";
import { createProduct, getProductForEdit, productReferenceCounts, deleteProduct } from "./product";

/**
 * Round-trip proof for the Story 4.3 admin catalog writes against real Postgres.
 * Self-seeds with a `zzz-int-test-43-` slug prefix and cleans up. Skips locally
 * if the DB is unreachable; in CI a connection failure is a real defect.
 */
const P = "zzz-int-test-43-";
let dbReachable = true;

async function cleanup() {
  await prisma.product.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.series.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.manufacturer.deleteMany({ where: { slug: { startsWith: P } } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await prisma.$disconnect();
});

describe("manufacturer writes", () => {
  it("creates with translations and reads them back; update replaces + clears a locale", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id } = await createManufacturer({
      slug: `${P}bosch`,
      translations: [
        { locale: "en", name: "Bosch", description: "EN desc" },
        { locale: "tr", name: "Bosch TR", description: null },
        { locale: "ru", name: "Bosch RU", description: null },
      ],
    });
    const created = await getManufacturerForEdit(id);
    expect(created?.translations).toHaveLength(3);

    // Update: keep EN, change TR, DROP RU — the cleared tab's row must disappear.
    const ok = await updateManufacturerTranslations(id, [
      { locale: "en", name: "Bosch", description: "EN desc 2" },
      { locale: "tr", name: "Bosch TR 2", description: null },
    ]);
    expect(ok).toBe(true);
    const updated = await getManufacturerForEdit(id);
    expect(updated?.translations.map((t) => t.locale).sort()).toEqual(["en", "tr"]);
    expect(updated?.translations.find((t) => t.locale === "en")?.description).toBe("EN desc 2");
  });

  it("refuses (via counts) while a series/product references it, then deletes with cascade", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id: mId } = await createManufacturer({
      slug: `${P}honeywell`,
      translations: [{ locale: "en", name: "HW" }],
    });
    const { id: sId } = await createSeries({
      slug: `${P}hw-series`,
      manufacturerId: mId,
      translations: [{ locale: "en", name: "HW Series" }],
    });

    expect(await manufacturerReferenceCounts(mId)).toEqual({ series: 1, products: 0 });

    await deleteSeries(sId);
    expect(await manufacturerReferenceCounts(mId)).toEqual({ series: 0, products: 0 });

    await deleteManufacturer(mId);
    // Translations cascade with the row.
    expect(await prisma.manufacturerTranslation.count({ where: { manufacturerId: mId } })).toBe(0);
    expect(await getManufacturerForEdit(mId)).toBeNull();
  });
});

describe("category cycle detection", () => {
  it("rejects self-parent and descendant-as-parent, allows unrelated", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id: a } = await createCategory({
      slug: `${P}cat-a`,
      translations: [{ locale: "en", name: "A" }],
    });
    const { id: b } = await createCategory({
      slug: `${P}cat-b`,
      parentId: a,
      translations: [{ locale: "en", name: "B" }],
    });

    expect(await wouldCreateCategoryCycle(a, a)).toBe(true); // self
    expect(await wouldCreateCategoryCycle(a, b)).toBe(true); // B is a child of A → cycle
    expect(await wouldCreateCategoryCycle(b, a)).toBe(false); // A as B's parent is fine (already is)

    // A category with children is blocked from deletion.
    expect((await categoryReferenceCounts(a)).children).toBe(1);
    // Re-parent B to top level, then A is deletable.
    await updateCategory(b, null, [{ locale: "en", name: "B" }]);
    expect((await categoryReferenceCounts(a)).children).toBe(0);
  });
});

describe("product writes", () => {
  it("creates a draft with attributes + translations and round-trips them", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id: mId } = await createManufacturer({
      slug: `${P}m`,
      translations: [{ locale: "en", name: "M" }],
    });
    const { id: cId } = await createCategory({
      slug: `${P}c`,
      translations: [{ locale: "en", name: "C" }],
    });
    const { id: pId } = await createProduct({
      slug: `${P}fx-100`,
      model: "FX-100",
      manufacturerId: mId,
      categoryId: cId,
      status: "draft",
      attributes: { voltage: "24V", ip: "IP65" },
      translations: [
        { locale: "en", name: "FX-100", description: "EN" },
        { locale: "tr", name: "FX-100 TR", description: null },
      ],
    });

    const p = await getProductForEdit(pId);
    expect(p?.status).toBe("draft");
    expect(p?.attributes).toEqual(
      expect.arrayContaining([
        { key: "voltage", value: "24V" },
        { key: "ip", value: "IP65" },
      ]),
    );
    expect(p?.translations.map((t) => t.locale).sort()).toEqual(["en", "tr"]);

    // Not referenced anywhere → deletable.
    expect(await productReferenceCounts(pId)).toEqual({
      bomLines: 0,
      accessories: 0,
      crossReferences: 0,
    });
    await deleteProduct(pId);
    expect(await getProductForEdit(pId)).toBeNull();
  });
});
