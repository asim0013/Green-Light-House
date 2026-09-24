// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { buildDatasetExport, type DatasetExport } from "./export";

/**
 * Full-dataset export (Story 4.9) verified against real Postgres. READ-ONLY — the
 * export writes nothing, so there is nothing to restore. Counts are compared to
 * LIVE `prisma.X.count()` (not hardcoded seed numbers) so the test proves the
 * export captures EVERY row without breaking when the seed changes. It also
 * proves translations round-trip UNRESOLVED (TR/RU present, not EN-collapsed),
 * JSON columns are raw, and NO credentials/approvals appear.
 *
 * ⚠️ CI never skips; a local missing DB is an honest skip.
 */
let dbReachable = false;
let out: DatasetExport;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReachable = true;
    out = await buildDatasetExport();
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buildDatasetExport (integration)", () => {
  it("captures EVERY row of every model (length === live count)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(out.data.industries.length).toBe(await prisma.industry.count());
    expect(out.data.manufacturers.length).toBe(await prisma.manufacturer.count());
    expect(out.data.categories.length).toBe(await prisma.category.count());
    expect(out.data.series.length).toBe(await prisma.series.count());
    expect(out.data.products.length).toBe(await prisma.product.count());
    expect(out.data.productIndustries.length).toBe(await prisma.productIndustry.count());
    expect(out.data.documents.length).toBe(await prisma.document.count());
    expect(out.data.documentIndustries.length).toBe(await prisma.documentIndustry.count());
    expect(out.data.projects.length).toBe(await prisma.project.count());
    expect(out.data.services.length).toBe(await prisma.service.count());
    expect(out.data.serviceIndustries.length).toBe(await prisma.serviceIndustry.count());
    expect(out.data.slaProcesses.length).toBe(await prisma.slaProcess.count());
    expect(out.data.homeContent.length).toBe(await prisma.homeContent.count());
    expect(out.data.teamMembers.length).toBe(await prisma.teamMember.count());
    expect(out.data.mediaAssets.length).toBe(await prisma.mediaAsset.count());
    expect(out.data.leads.length).toBe(await prisma.lead.count());
  });

  it("includes the singleton site settings and the SLA steps nested", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(out.data.siteSettings?.id).toBe("singleton");
    const process = out.data.slaProcesses[0];
    expect(process, "expected a seeded SLA process").toBeTruthy();
    expect(process.steps.length).toBe(await prisma.slaStep.count({ where: { processId: process.id } }));
    // BOM lines are nested under their project.
    const bomTotal = out.data.projects.reduce((n, p) => n + p.bomLines.length, 0);
    expect(bomTotal).toBe(await prisma.projectBomLine.count());
  });

  it("exports translations UNRESOLVED — all locale rows, not EN-collapsed", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Per-parent translation counts match the DB (nothing dropped or resolved away).
    const exportedIndustryTr = out.data.industries.reduce((n, i) => n + i.translations.length, 0);
    expect(exportedIndustryTr).toBe(await prisma.industryTranslation.count());
    // And a non-EN locale actually round-trips (the seed has TR/RU rows).
    const hasNonEn = out.data.industries.some((i) => i.translations.some((t) => t.locale !== "en"));
    expect(hasNonEn, "expected at least one non-EN industry translation in the export").toBe(true);
    // SLA step translations carry all three locales somewhere (badge/title/description).
    const stepLocales = new Set(
      out.data.slaProcesses.flatMap((p) => p.steps.flatMap((s) => s.translations.map((t) => t.locale))),
    );
    expect(stepLocales.size).toBeGreaterThan(1);
  });

  it("keeps JSON columns raw (not flattened)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Product.attributes / media are the stored JSON, not a string.
    for (const p of out.data.products) {
      expect(typeof p.attributes).toBe("object");
      expect(Array.isArray(p.media)).toBe(true);
    }
    // Home content certMarks is the raw JSON array.
    if (out.data.homeContent[0]) expect(Array.isArray(out.data.homeContent[0].certMarks)).toBe(true);
  });

  it("contains NO admin credentials or approval gates", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const json = JSON.stringify(out);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("resetTokenHash");
    expect(json).not.toContain("password_hash");
    expect(json).not.toContain("approvals");
    // Even if admin_users has rows in this environment, none leak into the export.
    expect(json.toLowerCase()).not.toContain("admin_users");
  });
});
