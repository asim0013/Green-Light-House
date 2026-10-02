// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { buildDatasetExport, type DatasetExport } from "./export";

/**
 * Full-dataset export (Story 4.9) verified against real Postgres. READ-ONLY.
 *
 * ⚠️ ASSERTS PRESENCE + STRUCTURE, NOT `length === live count`. The suite runs
 * integration files in parallel and several mutate shared tables (the
 * repository-fixture test, the 4.7 lead test, the 4.10 import test, the 4.11
 * guide test), so comparing the export (one snapshot) to a separately-queried
 * `count()` (another connection, another instant) is inherently racy and flaked
 * ~1/5. The real "captures EVERY row" guarantee is a static property of the
 * assembler — every read is an unbounded `findMany` with no `take`/`where` on the
 * content tables (verified by code review) — so this test proves instead that the
 * export is non-empty where the seed guarantees content, carries the singletons +
 * nested children, round-trips translations UNRESOLVED, keeps JSON raw, and leaks
 * no credentials. (A point-in-time-consistent export under a RepeatableRead
 * snapshot is a noted backup-fidelity follow-up.)
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
  it("captures the full dataset — every seeded collection is present and non-empty", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Seeded collections: the assembler returns them all (unbounded findMany), so
    // each is non-empty. P5: give any one a `take: 0` and it reddens.
    for (const key of [
      "industries",
      "manufacturers",
      "categories",
      "series",
      "products",
      "productIndustries",
      "documents",
      "projects",
      "services",
      "serviceIndustries",
      "slaProcesses",
      "homeContent",
    ] as const) {
      expect(out.data[key].length, `${key} should be non-empty`).toBeGreaterThan(0);
    }
    // Collections with no seed rows are still present as arrays (not omitted).
    expect(Array.isArray(out.data.leads)).toBe(true);
    expect(Array.isArray(out.data.mediaAssets)).toBe(true);
    expect(Array.isArray(out.data.teamMembers)).toBe(true);
    expect(Array.isArray(out.data.accessoryCompatibilities)).toBe(true);
    expect(Array.isArray(out.data.crossReferences)).toBe(true);
  });

  it("includes the singleton site settings and the SLA steps/BOM lines nested", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(out.data.siteSettings?.id).toBe("singleton");
    const process = out.data.slaProcesses.find((p) => p.key === "default");
    expect(process, "expected the seeded SLA process").toBeTruthy();
    expect(process!.steps.length).toBeGreaterThanOrEqual(3); // three seeded steps, nested
    const bomTotal = out.data.projects.reduce((n, p) => n + p.bomLines.length, 0);
    expect(bomTotal).toBeGreaterThan(0); // BOM lines nested under their project
  });

  it("exports translations UNRESOLVED — all locale rows, not EN-collapsed", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // A non-EN locale actually round-trips (the seed has TR/RU industry rows) —
    // proof the export is not resolved/EN-collapsed.
    const hasNonEn = out.data.industries.some((i) => i.translations.some((t) => t.locale !== "en"));
    expect(hasNonEn, "expected at least one non-EN industry translation").toBe(true);
    // SLA step translations carry more than one locale somewhere.
    const stepLocales = new Set(
      out.data.slaProcesses.flatMap((p) => p.steps.flatMap((s) => s.translations.map((t) => t.locale))),
    );
    expect(stepLocales.size).toBeGreaterThan(1);
  });

  it("keeps JSON columns raw (not flattened)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    for (const p of out.data.products) {
      expect(typeof p.attributes).toBe("object");
      expect(Array.isArray(p.media)).toBe(true);
    }
    if (out.data.homeContent[0]) expect(Array.isArray(out.data.homeContent[0].certMarks)).toBe(true);
  });

  it("contains NO admin credentials or approval gates", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const json = JSON.stringify(out);
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("resetTokenHash");
    expect(json).not.toContain("password_hash");
    expect(json).not.toContain("approvals");
    expect(json.toLowerCase()).not.toContain("admin_users");
  });
});
