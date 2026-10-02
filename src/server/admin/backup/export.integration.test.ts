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
let counts: Record<string, number>;

/**
 * ⚠️ Counts are captured CO-DISPATCHED with the export (one `Promise.all`, same
 * instant) and asserted against this snapshot — NOT re-queried later in the test
 * body. The suite runs integration files in parallel and several mutate shared
 * tables (the repository-fixture test, the 4.7 lead test, the 4.10 import test),
 * so re-counting seconds after `buildDatasetExport` raced those writers and
 * flaked `length === count`. (A truly point-in-time-consistent export would read
 * under a RepeatableRead snapshot — noted in deferred-work as a backup-fidelity
 * improvement, out of scope here.)
 */
async function countsSnapshot(): Promise<Record<string, number>> {
  const [
    industry, manufacturer, category, series, product, productIndustry, document,
    documentIndustry, project, service, serviceIndustry, slaProcess, homeContent,
    teamMember, mediaAsset, lead, slaStep, projectBomLine, industryTranslation,
  ] = await Promise.all([
    prisma.industry.count(), prisma.manufacturer.count(), prisma.category.count(),
    prisma.series.count(), prisma.product.count(), prisma.productIndustry.count(),
    prisma.document.count(), prisma.documentIndustry.count(), prisma.project.count(),
    prisma.service.count(), prisma.serviceIndustry.count(), prisma.slaProcess.count(),
    prisma.homeContent.count(), prisma.teamMember.count(), prisma.mediaAsset.count(),
    prisma.lead.count(), prisma.slaStep.count(), prisma.projectBomLine.count(),
    prisma.industryTranslation.count(),
  ]);
  return {
    industry, manufacturer, category, series, product, productIndustry, document,
    documentIndustry, project, service, serviceIndustry, slaProcess, homeContent,
    teamMember, mediaAsset, lead, slaStep, projectBomLine, industryTranslation,
  };
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbReachable = true;
    [out, counts] = await Promise.all([buildDatasetExport(), countsSnapshot()]);
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("buildDatasetExport (integration)", () => {
  it("captures EVERY row of every model (length === co-captured count)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(out.data.industries.length).toBe(counts.industry);
    expect(out.data.manufacturers.length).toBe(counts.manufacturer);
    expect(out.data.categories.length).toBe(counts.category);
    expect(out.data.series.length).toBe(counts.series);
    expect(out.data.products.length).toBe(counts.product);
    expect(out.data.productIndustries.length).toBe(counts.productIndustry);
    expect(out.data.documents.length).toBe(counts.document);
    expect(out.data.documentIndustries.length).toBe(counts.documentIndustry);
    expect(out.data.projects.length).toBe(counts.project);
    expect(out.data.services.length).toBe(counts.service);
    expect(out.data.serviceIndustries.length).toBe(counts.serviceIndustry);
    expect(out.data.slaProcesses.length).toBe(counts.slaProcess);
    expect(out.data.homeContent.length).toBe(counts.homeContent);
    expect(out.data.teamMembers.length).toBe(counts.teamMember);
    expect(out.data.mediaAssets.length).toBe(counts.mediaAsset);
    expect(out.data.leads.length).toBe(counts.lead);
  });

  it("includes the singleton site settings and the SLA steps nested", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(out.data.siteSettings?.id).toBe("singleton");
    expect(out.data.slaProcesses[0], "expected a seeded SLA process").toBeTruthy();
    // Total steps across all processes === the co-captured global slaStep count.
    const stepTotal = out.data.slaProcesses.reduce((n, p) => n + p.steps.length, 0);
    expect(stepTotal).toBe(counts.slaStep);
    // BOM lines are nested under their project.
    const bomTotal = out.data.projects.reduce((n, p) => n + p.bomLines.length, 0);
    expect(bomTotal).toBe(counts.projectBomLine);
  });

  it("exports translations UNRESOLVED — all locale rows, not EN-collapsed", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Per-parent translation counts match the co-captured DB count (nothing dropped/resolved away).
    const exportedIndustryTr = out.data.industries.reduce((n, i) => n + i.translations.length, 0);
    expect(exportedIndustryTr).toBe(counts.industryTranslation);
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
