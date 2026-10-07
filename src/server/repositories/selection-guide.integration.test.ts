// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createGuide,
  updateGuide,
  deleteGuide,
  queryGuideBySlug,
  getGuideForEdit,
  queryPublishedGuides,
  type GuideWriteData,
} from "./selection-guide";

// The cached `getGuideBySlug`/`listPublishedGuides` wrap `unstable_cache` (needs
// the Next runtime); integration tests use the uncached `query*` reads.
const getGuideBySlug = queryGuideBySlug;
const listPublishedGuides = queryPublishedGuides;

/**
 * Selection guides (Story 4.11) verified against real Postgres. Uses seeded
 * product/category ids for the curated links; creates `zzz-guide-*` guides it
 * deletes. Proves: create with sections + links + TR/RU, resolved public read
 * (EN fallback for the missing RU), the all-locale admin read, draft guides
 * hidden from the public reader + index, section/link replace on update, and
 * cascade on delete.
 */
let dbReachable = false;
let productId = "";
let categoryId = "";
const SLUG = "zzz-guide-1";
const DRAFT = "zzz-guide-draft";

function data(overrides: Partial<GuideWriteData> = {}): GuideWriteData {
  return {
    status: "published",
    translations: [
      {
        locale: "en",
        title: "Choosing flame detectors",
        intro: "EN intro",
        metaDescription: "EN meta",
      },
      { locale: "tr", title: "Alev dedektörü seçimi", intro: "TR intro", metaDescription: null },
    ],
    sections: [
      {
        sort: 0,
        translations: [
          { locale: "en", heading: "Step 1", body: "EN body" },
          { locale: "tr", heading: "Adım 1", body: "TR body" },
        ],
      },
      { sort: 1, translations: [{ locale: "en", heading: "Step 2", body: "EN body 2" }] },
    ],
    productIds: [productId],
    categoryIds: [categoryId],
    ...overrides,
  };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReachable = true;
    productId = (await prisma.product.findFirst({ select: { id: true } }))!.id;
    categoryId = (await prisma.category.findFirst({ select: { id: true } }))!.id;
    await prisma.selectionGuide.deleteMany({ where: { slug: { startsWith: "zzz-guide" } } });
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable)
    await prisma.selectionGuide.deleteMany({ where: { slug: { startsWith: "zzz-guide" } } });
  await prisma.$disconnect();
});

describe("selection-guide repository (integration)", () => {
  it("creates a guide and reads it back resolved, with EN fallback for RU", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id } = await createGuide(SLUG, data());

    const en = await getGuideBySlug(SLUG, "en");
    expect(en?.title).toBe("Choosing flame detectors");
    expect(en?.isFallback).toBe(false);
    expect(en?.sections.map((s) => s.heading)).toEqual(["Step 1", "Step 2"]); // ordered by sort
    expect(en?.products[0]?.slug).toBeTruthy();
    expect(en?.categories[0]?.slug).toBeTruthy();

    const tr = await getGuideBySlug(SLUG, "tr");
    expect(tr?.title).toBe("Alev dedektörü seçimi"); // TR provided
    expect(tr?.isFallback).toBe(false);

    const ru = await getGuideBySlug(SLUG, "ru");
    expect(ru?.title).toBe("Choosing flame detectors"); // no RU → EN fallback
    expect(ru?.isFallback).toBe(true);

    // Admin read is all-locale, unresolved.
    const edit = await getGuideForEdit(id);
    expect(edit?.translations).toHaveLength(2);
    expect(edit?.sections).toHaveLength(2);
    expect(edit?.productIds).toEqual([productId]);
    expect(edit?.categoryIds).toEqual([categoryId]);
  });

  it("hides a draft guide from the public reader and the index", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await createGuide(DRAFT, data({ status: "draft" }));
    expect(await getGuideBySlug(DRAFT, "en")).toBeNull();
    const index = await listPublishedGuides("en");
    expect(index.some((g) => g.slug === DRAFT)).toBe(false);
    expect(index.find((g) => g.slug === SLUG)?.sectionCount).toBe(2);
  });

  it("replaces sections + links on update (delete-then-create)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const existing = await getGuideForEdit(
      (
        await prisma.selectionGuide.findUniqueOrThrow({
          where: { slug: SLUG },
          select: { id: true },
        })
      ).id,
    );
    const ok = await updateGuide(
      existing!.id,
      data({
        sections: [{ sort: 0, translations: [{ locale: "en", heading: "Only step", body: "B" }] }],
        productIds: [],
        categoryIds: [],
      }),
    );
    expect(ok).toBe(true);
    const after = await getGuideForEdit(existing!.id);
    expect(after?.sections).toHaveLength(1);
    expect(after?.sections[0].translations[0].heading).toBe("Only step");
    expect(after?.productIds).toEqual([]); // links replaced (cleared)
  });

  it("cascades sections/translations/links on delete", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const row = await prisma.selectionGuide.findUniqueOrThrow({
      where: { slug: SLUG },
      select: { id: true },
    });
    await deleteGuide(row.id);
    expect(await getGuideForEdit(row.id)).toBeNull();
    expect(await prisma.selectionGuideSection.count({ where: { guideId: row.id } })).toBe(0);
    expect(await prisma.selectionGuideProduct.count({ where: { guideId: row.id } })).toBe(0);
    expect(await prisma.selectionGuideTranslation.count({ where: { guideId: row.id } })).toBe(0);
  });
});
