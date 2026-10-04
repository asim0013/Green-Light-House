// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

/**
 * Story 5.3 (FR47, AC1/AC3) — data residency, proven against a REAL second database.
 *
 * A throwaway Postgres database stands in for "the regional leads store". It is
 * migrated with the real `prisma migrate deploy` (exactly what a deploy runs against
 * LEADS_DATABASE_URL), the lead repository is loaded with LEADS_DATABASE_URL pointed
 * at it, and then:
 *   - a created lead (and its DB-minted GLH-RFQ reference) lands THERE and is ABSENT
 *     from the main database;
 *   - the honeypot's raw `nextval('lead_reference_seq')` draw advances THAT
 *     database's sequence and leaves the main one untouched (a draw on the wrong
 *     store could mint a "fake" reference equal to a real one).
 *
 * The throwaway is created with CREATE DATABASE from the main connection (`glh` is
 * the bootstrap superuser in docker-compose and CI) and DROPPED in afterAll.
 * `greenlighthouse` is only ever READ here — two counts and a sequence read.
 * Skips locally if Postgres is unreachable; throws in CI.
 */
const MAIN_URL = process.env.DATABASE_URL ?? "";
const DB_NAME = `glh_residency_${process.pid}_${Date.now()}`;
const leadsUrl = () => {
  const u = new URL(MAIN_URL);
  u.pathname = `/${DB_NAME}`;
  return u.toString();
};
const EMAIL = `zzz-residency-${DB_NAME}@example.com`;

let ready = true;
let created = false;
let main: PrismaClient;
let regional: PrismaClient;
let repo: typeof import("./lead");
let repoLeadsDb: { $disconnect(): Promise<void> } | undefined;
const savedLeadsUrl = process.env.LEADS_DATABASE_URL;

/** last_value of lead_reference_seq on a given database. */
async function seqValue(db: PrismaClient): Promise<bigint> {
  const rows = await db.$queryRaw<{ last_value: bigint }[]>`SELECT last_value FROM lead_reference_seq`;
  return rows[0].last_value;
}

beforeAll(async () => {
  main = new PrismaClient({ datasources: { db: { url: MAIN_URL } } });
  try {
    await main.$queryRaw`SELECT 1`;
  } catch (err) {
    if (process.env.CI) throw err;
    ready = false;
    return;
  }
  await main.$executeRawUnsafe(`CREATE DATABASE "${DB_NAME}"`);
  created = true;
  // The full schema + lead_reference_seq, via the real migrations.
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: leadsUrl() },
    stdio: "pipe",
  });
  regional = new PrismaClient({ datasources: { db: { url: leadsUrl() } } });

  // Load the repository FRESH with the leads store pointed at the throwaway. The
  // dev HMR global would otherwise hand back an already-built client.
  process.env.LEADS_DATABASE_URL = leadsUrl();
  const g = globalThis as { prisma?: unknown; leadsDb?: unknown };
  delete g.prisma;
  delete g.leadsDb;
  vi.resetModules();
  repo = await import("./lead");
  repoLeadsDb = (await import("@/lib/db")).leadsDb;
}, 240_000);

afterAll(async () => {
  if (savedLeadsUrl === undefined) delete process.env.LEADS_DATABASE_URL;
  else process.env.LEADS_DATABASE_URL = savedLeadsUrl;
  await repoLeadsDb?.$disconnect().catch(() => undefined);
  await regional?.$disconnect().catch(() => undefined);
  if (created) await main.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
  // Safety net: if routing were broken, this test's OWN rows land in the main
  // database. Remove only those (unique per-run email) so a red run never pollutes it.
  if (ready) await main.lead.deleteMany({ where: { email: { startsWith: `zzz-residency-${DB_NAME}` } } });
  await main?.$disconnect();
}, 60_000);

describe("leads store residency (Story 5.3)", () => {
  it("a created lead lands in the configured leads database — and NOT the main one", async (ctx) => {
    if (!ready) return ctx.skip();
    const before = await main.lead.count({ where: { email: EMAIL } });

    const { id, reference } = await repo.createLead({
      company: "Residency Test",
      name: "Proof",
      email: EMAIL,
      consent: true,
      consentAt: new Date(),
      consentVersion: "test:en",
    });

    expect(reference).toMatch(/^GLH-RFQ-\d+$/);
    const there = await regional.lead.findUnique({ where: { id } });
    expect(there?.email).toBe(EMAIL);
    expect(there?.reference).toBe(reference);
    // P5: point leadsDb at the main URL and this reddens (count goes up by one).
    expect(await main.lead.count({ where: { email: EMAIL } })).toBe(before);
  });

  it("the honeypot's sequence draw advances the LEADS database's sequence only", async (ctx) => {
    if (!ready) return ctx.skip();
    const mainBefore = await seqValue(main);
    const fake = await repo.burnLeadReference();
    expect(fake).toMatch(/^GLH-RFQ-\d+$/);
    expect(BigInt(fake.replace("GLH-RFQ-", ""))).toBe(await seqValue(regional));
    expect(await seqValue(main)).toBe(mainBefore);
  });

  it("reads go to the leads database too — a row seeded ONLY there is visible to the repository", async (ctx) => {
    if (!ready) return ctx.skip();
    // Seeded straight into the regional database, bypassing the repository — so a
    // repository READ can only see it if it really reads that database. (Reading a
    // row the repository itself wrote would agree with itself under mis-routing.)
    const seeded = await regional.lead.create({
      data: { company: "Seeded", name: "Direct", email: `${EMAIL}.seeded`, consent: true },
      select: { id: true },
    });
    expect(await repo.getLeadForAdmin(seeded.id)).not.toBeNull();
    expect(await main.lead.findUnique({ where: { id: seeded.id } })).toBeNull();
  });
});
