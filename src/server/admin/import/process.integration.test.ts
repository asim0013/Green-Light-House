// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { processImport } from "./process";
import type { RawRow } from "./parse";

/**
 * Bulk product import (Story 4.10) verified against real Postgres. Uses the seed's
 * existing manufacturer/category/industry slugs (fetched at runtime, not
 * hardcoded) and creates `zzz-imp-*` products it cleans up. Proves: create +
 * idempotent update, translation update, **media preservation** (the crux),
 * unknown-FK-slug row error (no write), and validation-fail row error (no write).
 *
 * ⚠️ CI never skips; a local missing DB is an honest skip.
 */
let dbReachable = false;
let mfr = "";
let cat = "";
let ind = "";
const SLUG = "zzz-imp-fd1";

function row(overrides: Partial<RawRow> = {}): RawRow {
  return {
    slug: SLUG,
    model: "IMP-1",
    manufacturerSlug: mfr,
    categorySlug: cat,
    status: "published",
    name_en: "Imported detector",
    ...overrides,
  };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReachable = true;
    mfr = (await prisma.manufacturer.findFirst({
      orderBy: { slug: "asc" },
      select: { slug: true },
    }))!.slug;
    cat = (await prisma.category.findFirst({ orderBy: { slug: "asc" }, select: { slug: true } }))!
      .slug;
    ind = (await prisma.industry.findFirst({ orderBy: { slug: "asc" }, select: { slug: true } }))!
      .slug;
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) await prisma.product.deleteMany({ where: { slug: { startsWith: "zzz-imp" } } });
  await prisma.$disconnect();
});

describe("processImport (integration)", () => {
  it("creates a new product, then is idempotent on re-run and updates on change", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const first = await processImport([row({ industrySlugs: ind })]);
    expect(first).toMatchObject({ total: 1, created: 1, updated: 0, errored: 0 });

    const created = await prisma.product.findUnique({
      where: { slug: SLUG },
      select: { status: true, translations: true, industries: true },
    });
    expect(created?.status).toBe("published");
    expect(created?.translations.find((t) => t.locale === "en")?.name).toBe("Imported detector");
    expect(created?.industries).toHaveLength(1);

    // Re-run identical → update (idempotent: same values, no dupe).
    const second = await processImport([row({ industrySlugs: ind })]);
    expect(second).toMatchObject({ created: 0, updated: 1, errored: 0 });
    expect(await prisma.product.count({ where: { slug: SLUG } })).toBe(1);

    // Change the name → translation updated.
    await processImport([row({ name_en: "Renamed detector" })]);
    const renamed = await prisma.product.findUnique({
      where: { slug: SLUG },
      select: { translations: true },
    });
    expect(renamed?.translations.find((t) => t.locale === "en")?.name).toBe("Renamed detector");
  });

  it("PRESERVES existing media AND omitted attributes on an import update (the crux)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Import WITH attributes first, so there is an attribute set to preserve.
    await processImport([row({ attributes: '{"ip":"IP66"}' })]);
    // Simulate a media-library link set via the CRUD/picker.
    await prisma.product.update({ where: { slug: SLUG }, data: { media: ["asset-keep-1"] } });
    // A re-import that OMITS media (no column) and OMITS attributes must wipe neither.
    await processImport([row({ name_en: "Detector v2" })]);
    const after = await prisma.product.findUnique({
      where: { slug: SLUG },
      select: { media: true, attributes: true },
    });
    expect(after?.media).toEqual(["asset-keep-1"]);
    expect(after?.attributes).toEqual({ ip: "IP66" }); // attributes preserved when the sheet omits them
  });

  it("errors a row with an unknown manufacturer slug — nothing written", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slug = "zzz-imp-badmfr";
    const report = await processImport([row({ slug, manufacturerSlug: "no-such-manufacturer" })]);
    expect(report).toMatchObject({ created: 0, updated: 0, errored: 1 });
    expect(report.errors[0]).toMatchObject({
      field: "manufacturerSlug",
      key: "unknownManufacturer",
    });
    expect(await prisma.product.findUnique({ where: { slug } })).toBeNull();
  });

  it("errors a validation-failing row (blank name_en) — nothing written", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slug = "zzz-imp-noname";
    const report = await processImport([row({ slug, name_en: "" })]);
    expect(report.created).toBe(0);
    expect(report.errored).toBe(1);
    expect(await prisma.product.findUnique({ where: { slug } })).toBeNull();
  });

  it("reports a file-level error when a required column is absent", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // No manufacturerSlug column at all.
    const report = await processImport([
      { slug: "zzz-imp-x", model: "M", categorySlug: cat, name_en: "X" },
    ]);
    expect(report.fileError).toContain("manufacturerSlug");
    expect(report.created).toBe(0);
  });
});
