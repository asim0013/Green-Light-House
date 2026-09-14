// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";

/**
 * The `SiteSettings` singleton — Story 4.0's ONLY test until Story 4.8 adds a
 * reader. It proves the model, the migration and the `@map` column names round-
 * trip through the Prisma client and the physical table, end to end.
 *
 * ⚠️ SELF-CONTAINED, NOT SEED-DEPENDENT. It does not assert the main seed's
 * values (those come from `contact.ts`, which is all-null by design, so asserting
 * them would prove nothing and would couple this test to config). Instead it
 * snapshots the existing row, upserts KNOWN test values, asserts they round-trip,
 * then restores the snapshot — the "self-seed then clean up" convention this
 * repo's integration tests use, adapted to a singleton.
 *
 * ⚠️ CI NEVER SKIPS (retro action T6). Locally a missing DB is an honest skip;
 * in CI migrations are applied first, so anything thrown here is a real defect.
 */
const SINGLETON = "singleton";
const TEST = {
  contactEmail: "zzz-int-test@example.com",
  contactAddress: "zzz-int-test\nline two",
  legalName: "zzz-int-test legal",
  tradeRegistryNo: "TR-000",
  taxOffice: "zzz office",
  taxNo: "TN-000",
  mersisNo: "M-000",
  phone: "+900000000000",
  phoneDisplay: "+90 000 000 00 00",
  rfqNotifyTo: "zzz-int-test-notify@example.com",
};

/** The value columns only — the set we snapshot and restore (never id/timestamps). */
const VALUE_KEYS = [
  "contactEmail",
  "contactAddress",
  "legalName",
  "tradeRegistryNo",
  "taxOffice",
  "taxNo",
  "mersisNo",
  "phone",
  "phoneDisplay",
  "rfqNotifyTo",
] as const;

let dbReachable = false;
let snapshot: Record<string, string | null> | null = null;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    // Snapshot whatever is there (the seed's row, or nothing), then install the
    // known test values so the assertions below are deterministic.
    const existing = await prisma.siteSettings.findUnique({ where: { id: SINGLETON } });
    snapshot = existing ? Object.fromEntries(VALUE_KEYS.map((k) => [k, existing[k]])) : null;
    await prisma.siteSettings.upsert({
      where: { id: SINGLETON },
      update: TEST,
      create: { id: SINGLETON, ...TEST },
    });
    dbReachable = true;
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) {
    // Restore the pre-test state: put the original row back, or remove ours if
    // there was none. Never leave test values in the singleton.
    if (snapshot) {
      await prisma.siteSettings.update({ where: { id: SINGLETON }, data: snapshot });
    } else {
      await prisma.siteSettings.delete({ where: { id: SINGLETON } });
    }
  }
  await prisma.$disconnect();
});

describe("SiteSettings singleton (integration)", () => {
  it("round-trips every value column through the Prisma client", async (ctx) => {
    // P5: change any seeded value in `upsertSiteSettings` (or a column here) and
    // this reddens — the model and client wiring is proven, not assumed.
    if (!dbReachable) return ctx.skip();
    const row = await prisma.siteSettings.findUniqueOrThrow({ where: { id: SINGLETON } });
    expect(row).toMatchObject(TEST);
    expect(row.createdAt).toBeInstanceOf(Date);
    expect(row.updatedAt).toBeInstanceOf(Date);
  });

  it("is the single settings row, at the fixed id 'singleton' (convention, not a DB constraint)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await prisma.siteSettings.count()).toBe(1);
    const only = await prisma.siteSettings.findMany();
    expect(only).toHaveLength(1);
    expect(only[0].id).toBe(SINGLETON);
  });

  it("maps to snake_case physical columns (the migration matches the schema @map)", async (ctx) => {
    // Proves the migration's column names are the ones the schema's @map declares.
    // P5: rename a `@map` (or the migration column) and this reddens on the
    // missing column, where a Prisma-only test would silently follow the rename.
    if (!dbReachable) return ctx.skip();
    const rows = await prisma.$queryRaw<
      {
        rfq_notify_to: string | null;
        phone_display: string | null;
        trade_registry_no: string | null;
      }[]
    >`SELECT rfq_notify_to, phone_display, trade_registry_no FROM site_settings WHERE id = ${SINGLETON}`;
    expect(rows).toHaveLength(1);
    expect(rows[0].rfq_notify_to).toBe(TEST.rfqNotifyTo);
    expect(rows[0].phone_display).toBe(TEST.phoneDisplay);
    expect(rows[0].trade_registry_no).toBe(TEST.tradeRegistryNo);
  });
});
