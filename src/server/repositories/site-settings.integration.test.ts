// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { querySitePhone, queryContactDetails } from "./site-settings";
import { resolveNotifyRecipient } from "@/lib/email";
import { CONTACT } from "@/config/contact";
import { SITE } from "@/config/site";

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

/**
 * Story 4.8 — the READER the file's docstring said this story would add. These
 * live HERE (not in a separate file) on purpose: vitest parallelises test FILES
 * by default, and two files mutating this one singleton row would race. Within a
 * file the `it`s run in order, so these follow the 4.0 assertions above and the
 * file's `afterAll` restores the original snapshot. Uses the UNCACHED query fns
 * (the cached wrappers need the Next runtime), same as `queryHomeContent`.
 */
async function setRow(values: Partial<Record<(typeof VALUE_KEYS)[number], string | null>>) {
  await prisma.siteSettings.upsert({
    where: { id: SINGLETON },
    update: values,
    create: { id: SINGLETON, ...values },
  });
}

afterEach(() => {
  delete process.env.RFQ_NOTIFY_TO;
});

describe("getContactDetails — row values, CODE approvals (Story 4.8, AC4)", () => {
  it("takes email/address/legal from the row, and approvals ALWAYS from contact.ts", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await setRow({
      contactEmail: "  ops@glh.example  ",
      contactAddress: "Line one\nLine two",
      legalName: "GLH Yangın A.Ş.",
      tradeRegistryNo: "TR-123",
      taxOffice: "Kadıköy",
      taxNo: "TN-123",
      mersisNo: "M-123",
    });
    const details = await queryContactDetails();
    expect(details.email).toBe("ops@glh.example"); // trimmed via suppliedValue
    expect(details.address).toBe("Line one\nLine two"); // interior whitespace kept
    expect(details.legal.legalName).toBe("GLH Yangın A.Ş.");
    expect(details.legal.mersisNo).toBe("M-123");
    // ⛔ The safety invariant: approvals come from code, NOT the row (there is no
    // approvals column). P5: source approvals from the row and this reddens.
    expect(details.approvals).toEqual(CONTACT.approvals);
  });

  it("falls back field-by-field to contact.ts when the row is blank/null", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await setRow({
      contactEmail: null,
      contactAddress: "   ",
      legalName: null,
      tradeRegistryNo: null,
      taxOffice: null,
      taxNo: null,
      mersisNo: null,
    });
    const details = await queryContactDetails();
    expect(details.email).toBe(CONTACT.email);
    expect(details.address).toBe(CONTACT.address); // blank → not supplied → fallback
    expect(details.legal.legalName).toBe(CONTACT.legal.legalName);
  });
});

describe("getSitePhone — row value, SITE fallback (Story 4.8, AC5)", () => {
  it("uses the row phone when supplied", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await setRow({ phone: "+905551112233", phoneDisplay: "+90 555 111 22 33" });
    expect(await querySitePhone()).toEqual({
      phone: "+905551112233",
      phoneDisplay: "+90 555 111 22 33",
    });
  });

  it("falls back to SITE.phone when the row is blank/null", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await setRow({ phone: "   ", phoneDisplay: null });
    expect(await querySitePhone()).toEqual({ phone: SITE.phone, phoneDisplay: SITE.phoneDisplay });
  });
});

describe("resolveNotifyRecipient — row wins, env fallback (Story 4.8, AC3)", () => {
  it("routes to the admin-managed recipient over the env var", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await setRow({ rfqNotifyTo: "  admin@glh.example  " });
    process.env.RFQ_NOTIFY_TO = "env@glh.example";
    expect(await resolveNotifyRecipient()).toBe("admin@glh.example");
  });

  it("falls back to the env var when the row has none", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await setRow({ rfqNotifyTo: null });
    process.env.RFQ_NOTIFY_TO = "env@glh.example";
    expect(await resolveNotifyRecipient()).toBe("env@glh.example");
  });
});
