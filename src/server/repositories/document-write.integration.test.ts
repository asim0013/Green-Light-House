// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createDocument,
  replaceDocumentFile,
  updateDocumentMeta,
  getDocumentForEdit,
  deleteDocument,
  queryDocumentBySlug,
  queryDocumentsByProduct,
  queryCertificatesByIndustry,
} from "./document";

/**
 * Story 4.6 document write repo, against real Postgres. Temp rows (unique slugs)
 * tracked + removed in afterAll — the seeded fd-9500 documents are never touched.
 * `deleteDocument` calls `deleteObject` (idempotent), so a synthetic `docs/` key
 * deletes cleanly. Skips locally if the DB is unreachable, throws in CI.
 */
let dbReachable = true;
const docIds: string[] = [];
const industryIds: string[] = [];
const manufacturerIds: string[] = [];
const categoryIds: string[] = [];
const productIds: string[] = [];
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
    for (const id of docIds) await prisma.document.deleteMany({ where: { id } });
    for (const id of productIds) await prisma.product.deleteMany({ where: { id } });
    for (const id of categoryIds) await prisma.category.deleteMany({ where: { id } });
    for (const id of manufacturerIds) await prisma.manufacturer.deleteMany({ where: { id } });
    for (const id of industryIds) await prisma.industry.deleteMany({ where: { id } });
  }
  await prisma.$disconnect();
});

describe("document create / replace / edit / delete", () => {
  it("FR25a: a replace keeps the slug and serves the new file at the same URL", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slug = `t-doc-${uid()}`;
    const { id } = await createDocument({
      slug,
      type: "datasheet",
      fileKey: `docs/${uid()}-v1.pdf`,
      mime: "application/pdf",
      sizeBytes: 1000,
      isPublic: true,
      industryIds: [],
      translations: [
        { locale: "en", title: "Spec sheet" },
        { locale: "tr", title: "Teknik föy" },
      ],
    });
    docIds.push(id);

    const v1 = await queryDocumentBySlug(slug);
    expect(v1?.fileKey).toMatch(/-v1\.pdf$/);

    // Replace the file — same slug, new fileKey, version bumped.
    const newKey = `docs/${uid()}-v2.pdf`;
    const res = await replaceDocumentFile(id, {
      fileKey: newKey,
      mime: "application/pdf",
      sizeBytes: 2000,
    });
    expect(res?.oldFileKey).toBe(v1?.fileKey);

    const v2 = await queryDocumentBySlug(slug);
    expect(v2?.slug).toBe(slug); // URL identity unchanged
    expect(v2?.fileKey).toBe(newKey); // serves the new object
    expect(v2?.sizeBytes).toBe(2000);
    const edit = await getDocumentForEdit(id);
    expect(edit?.version).toBe(2);
    expect(edit?.downloadHref).toBe(`/api/documents/${slug}`);
  });

  it("unpublish → 404 (null); republish + retitle round-trips", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slug = `t-doc-${uid()}`;
    const { id } = await createDocument({
      slug,
      type: "certificate",
      fileKey: `docs/${uid()}.pdf`,
      mime: "application/pdf",
      sizeBytes: 500,
      isPublic: true,
      industryIds: [],
      translations: [{ locale: "en", title: "ISO 9001" }],
    });
    docIds.push(id);
    expect((await queryDocumentBySlug(slug))?.slug).toBe(slug);

    // Unpublish → private → the download resolver returns null (404 upstream).
    await updateDocumentMeta(id, {
      type: "certificate",
      isPublic: false,
      industryIds: [],
      translations: [{ locale: "en", title: "ISO 9001" }],
    });
    expect(await queryDocumentBySlug(slug)).toBeNull();

    // Republish + change type + drop to EN only.
    await updateDocumentMeta(id, {
      type: "catalog",
      isPublic: true,
      industryIds: [],
      translations: [{ locale: "en", title: "Product catalog" }],
    });
    const edit = await getDocumentForEdit(id);
    expect(edit?.isPublic).toBe(true);
    expect(edit?.type).toBe("catalog");
    expect(edit?.translations.map((t) => t.locale)).toEqual(["en"]);

    await deleteDocument(id);
    expect(await getDocumentForEdit(id)).toBeNull();
  });
});

describe("associations", () => {
  it("links to a product and industries; both public readers surface it", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const ind = await prisma.industry.create({
      data: { slug: `t-ind-${uid()}` },
      select: { id: true, slug: true },
    });
    industryIds.push(ind.id);
    const mfr = await prisma.manufacturer.create({
      data: { slug: `t-mfr-${uid()}` },
      select: { id: true },
    });
    manufacturerIds.push(mfr.id);
    const cat = await prisma.category.create({
      data: { slug: `t-cat-${uid()}` },
      select: { id: true },
    });
    categoryIds.push(cat.id);
    const prod = await prisma.product.create({
      data: { model: "D-1", slug: `t-prod-${uid()}`, manufacturerId: mfr.id, categoryId: cat.id },
      select: { id: true, slug: true },
    });
    productIds.push(prod.id);

    const slug = `t-doc-${uid()}`;
    const { id } = await createDocument({
      slug,
      type: "certificate",
      fileKey: `docs/${uid()}.pdf`,
      mime: "application/pdf",
      sizeBytes: 700,
      isPublic: true,
      productId: prod.id,
      industryIds: [ind.id],
      translations: [{ locale: "en", title: "EN 54 certificate" }],
    });
    docIds.push(id);

    // Certificate shows in the industry block…
    const certs = await queryCertificatesByIndustry(ind.slug, "en");
    expect(certs.find((c) => c.slug === slug)?.title).toBe("EN 54 certificate");
    // …and in the product's documents section.
    const prodDocs = await queryDocumentsByProduct(prod.slug, "en");
    expect(prodDocs.find((d) => d.slug === slug)?.type).toBe("certificate");
    // Edit DTO reflects the links.
    const edit = await getDocumentForEdit(id);
    expect(edit?.productId).toBe(prod.id);
    expect(edit?.industryIds).toEqual([ind.id]);
  });
});
