// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { mediaHref } from "@/lib/media";
import {
  createMediaAsset,
  getMediaAssetForEdit,
  listMediaAssets,
  listMediaAssetOptions,
  updateMediaAssetAlt,
  mediaAssetReferenceCounts,
  isReferenced,
  deleteMediaAsset,
  getMediaStorageKey,
} from "./media";

/**
 * Story 4.5 media library, against real Postgres. Every fixture is a temp row
 * tracked by id and removed in afterAll — seeded data is never touched. The S3
 * object is never really created; `deleteObject` is idempotent, so a synthetic
 * `storageKey` deletes cleanly. Skips locally if the DB is unreachable, throws in CI.
 */
let dbReachable = true;
const createdAssetIds: string[] = [];
const createdManufacturerIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
const createdProjectIds: string[] = [];
const createdTeamIds: string[] = [];

const uid = () => globalThis.crypto.randomUUID();

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) {
    for (const id of createdProductIds) await prisma.product.deleteMany({ where: { id } });
    for (const id of createdProjectIds) await prisma.project.deleteMany({ where: { id } });
    for (const id of createdTeamIds) await prisma.teamMember.deleteMany({ where: { id } });
    for (const id of createdManufacturerIds)
      await prisma.manufacturer.deleteMany({ where: { id } });
    for (const id of createdCategoryIds) await prisma.category.deleteMany({ where: { id } });
    for (const id of createdAssetIds) await prisma.mediaAsset.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("media asset round-trip", () => {
  it("creates, edits alt (dropping a locale), lists and resolves storage key", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const storageKey = `media/${uid()}.png`;
    const { id } = await createMediaAsset({
      storageKey,
      kind: "image",
      mime: "image/png",
      originalName: "detector.png",
      sizeBytes: 2048,
      width: 800,
      height: 600,
      translations: [
        { locale: "en", alt: "Flame detector" },
        { locale: "tr", alt: "Alev dedektörü" },
      ],
    });
    createdAssetIds.push(id);

    const edit = await getMediaAssetForEdit(id);
    expect(edit?.href).toBe(mediaHref(id));
    expect(edit?.kind).toBe("image");
    expect(edit?.width).toBe(800);
    expect(edit?.translations.map((t) => t.locale).sort()).toEqual(["en", "tr"]);

    // storageKey is resolvable server-side but never appears in the edit DTO.
    expect((edit as unknown as Record<string, unknown>).storageKey).toBeUndefined();
    expect((await getMediaStorageKey(id))?.storageKey).toBe(storageKey);

    // Admin list: EN-fallback alt for a locale with no row.
    const listRu = await listMediaAssets("ru");
    expect(listRu.find((a) => a.id === id)?.alt).toBe("Flame detector");

    // Picker options are image-only and carry the EN-fallback label.
    const options = await listMediaAssetOptions("en");
    expect(options.find((o) => o.id === id)?.label).toBe("Flame detector");

    // Replace alt: keep EN, drop TR.
    const ok = await updateMediaAssetAlt(id, [{ locale: "en", alt: "Triple-IR flame detector" }]);
    expect(ok).toBe(true);
    const edited = await getMediaAssetForEdit(id);
    expect(edited?.translations.map((t) => t.locale)).toEqual(["en"]);
    expect(edited?.translations[0].alt).toBe("Triple-IR flame detector");
  });
});

describe("reference guard", () => {
  it("counts references across manufacturer, team, project and product; refuses while referenced", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const storageKey = `media/${uid()}.png`;
    const { id: assetId } = await createMediaAsset({
      storageKey,
      kind: "image",
      mime: "image/png",
      originalName: "logo.png",
      sizeBytes: 512,
      translations: [{ locale: "en", alt: "Logo" }],
    });
    createdAssetIds.push(assetId);

    // Unreferenced to begin with.
    expect(isReferenced(await mediaAssetReferenceCounts(assetId))).toBe(false);

    // Manufacturer logo stores the href.
    const mfr = await prisma.manufacturer.create({
      data: { slug: `t-mfr-${uid()}`, logoUrl: mediaHref(assetId) },
      select: { id: true },
    });
    createdManufacturerIds.push(mfr.id);

    // Team photoKey stores the bare id.
    const team = await prisma.teamMember.create({ data: { order: 99, photoKey: assetId } });
    createdTeamIds.push(team.id);

    // Project media (frozen shape) references by storageKey.
    const project = await prisma.project.create({
      data: {
        slug: `t-proj-${uid()}`,
        media: [{ id: "photo-1", storageKey, mime: "image/png", alt: { en: "Logo" }, sort: 0 }],
      },
      select: { id: true },
    });
    createdProjectIds.push(project.id);

    // Product media references by id (string[]).
    const cat = await prisma.category.create({
      data: { slug: `t-cat-${uid()}` },
      select: { id: true },
    });
    createdCategoryIds.push(cat.id);
    const product = await prisma.product.create({
      data: {
        model: "T-1000",
        slug: `t-prod-${uid()}`,
        manufacturerId: mfr.id,
        categoryId: cat.id,
        media: [assetId],
      },
      select: { id: true },
    });
    createdProductIds.push(product.id);

    const counts = await mediaAssetReferenceCounts(assetId);
    expect(counts).toEqual({ manufacturers: 1, teamMembers: 1, projects: 1, products: 1 });
    expect(isReferenced(counts)).toBe(true);
  });

  it("deletes an unreferenced asset (idempotent object delete + row)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id } = await createMediaAsset({
      storageKey: `media/${uid()}.png`,
      kind: "image",
      mime: "image/png",
      originalName: "orphan.png",
      sizeBytes: 128,
    });
    await deleteMediaAsset(id);
    expect(await getMediaAssetForEdit(id)).toBeNull();
  });
});
