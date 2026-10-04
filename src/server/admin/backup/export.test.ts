import { describe, it, expect, vi } from "vitest";

/**
 * Full-dataset export assembler (Story 4.9). The full-fidelity shape + counts are
 * proven against real Postgres in `export.integration.test.ts`; this unit test
 * pins the SECURITY-CRITICAL invariants with a recording mock: which models the
 * assembler touches (and, crucially, that `adminUser` is NEVER among them), the
 * meta envelope, and that no credential/approval field can appear in the output.
 */
/** Models read through the CATALOG client vs the LEADS store (Story 5.3). */
const accessed = new Set<string>();
const accessedLeads = new Set<string>();
vi.mock("@/lib/db", () => {
  const recorder = (seen: Set<string>) => {
    const models: Record<string, { findMany: () => Promise<unknown[]>; findUnique: () => Promise<null> }> = {};
    return new Proxy(
      {},
      {
        get(_t, key: string) {
          seen.add(key);
          models[key] ??= {
            findMany: () => Promise.resolve([]),
            findUnique: () => Promise.resolve(null),
          };
          return models[key];
        },
      },
    );
  };
  return { prisma: recorder(accessed), leadsDb: recorder(accessedLeads) };
});

const { buildDatasetExport } = await import("./export");

describe("buildDatasetExport", () => {
  it("NEVER reads AdminUser (no credentials in a downloadable backup)", async () => {
    accessed.clear();
    accessedLeads.clear();
    await buildDatasetExport();
    // The security invariant: the assembler must not query the admin_users table.
    // P5: add `prisma.adminUser.findMany(...)` to the assembler and this reddens.
    expect(accessed.has("adminUser")).toBe(false);
    expect(accessedLeads.has("adminUser")).toBe(false);
    // ...and it DID read the content/catalog/lead models it is supposed to.
    for (const model of [
      "industry",
      "manufacturer",
      "category",
      "series",
      "product",
      "productIndustry",
      "document",
      "documentIndustry",
      "project",
      "service",
      "serviceIndustry",
      "accessoryCompatibility",
      "crossReference",
      "slaProcess",
      "homeContent",
      "teamMember",
      "mediaAsset",
      "siteSettings",
    ]) {
      expect(accessed.has(model), `assembler should read ${model}`).toBe(true);
    }
    // Story 5.3: leads come from the LEADS store, never the catalog client — with the
    // stores split, a catalog read would back up an EMPTY table.
    // P5: change the assembler back to `prisma.lead.findMany` and BOTH lines redden.
    expect(accessedLeads.has("lead"), "leads read from the leads store").toBe(true);
    expect(accessed.has("lead"), "leads NOT read from the catalog client").toBe(false);
  });

  it("emits a versioned meta envelope and every data collection", async () => {
    const out = await buildDatasetExport();
    expect(out.meta.formatVersion).toBe(1);
    expect(out.meta.generator).toBe("glh");
    expect(() => new Date(out.meta.exportedAt).toISOString()).not.toThrow();
    expect(Object.keys(out.data)).toContain("leads");
    expect(Object.keys(out.data)).toContain("siteSettings");
    expect(Array.isArray(out.data.products)).toBe(true);
  });

  it("serializes to JSON with no credential or approval fields", async () => {
    // Even structurally: the words must not appear, so a future include of an
    // AdminUser row or a `contact.approvals` leak reddens here.
    const json = JSON.stringify(await buildDatasetExport());
    expect(json).not.toContain("passwordHash");
    expect(json).not.toContain("resetTokenHash");
    expect(json).not.toContain("approvals");
  });
});
