// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureDefaultSla } from "./sla-bootstrap";
import { SLA_PROCESS_KEY, SLA_STEPS, slaTextFor } from "../../../scripts/sla-fixtures";

/**
 * The production SLA bootstrap against real Postgres.
 *
 * NOTHING HERE PERSISTS. Every case runs inside an interactive transaction that
 * ends by throwing `ROLLBACK`, so the seeded dev SLA is never deleted or edited
 * even when an assertion fails mid-way — no snapshot/restore to get wrong.
 * Skips locally if the DB is unreachable, throws in CI.
 */
const ROLLBACK = new Error("rollback (test)");
let dbReachable = true;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** Run `body` in a transaction that is ALWAYS rolled back; rethrow real failures. */
async function inRolledBackTx(body: (tx: Parameters<typeof ensureDefaultSla>[0]) => Promise<void>) {
  try {
    await prisma.$transaction(async (tx) => {
      await body(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
}

/** The process as the public site would read it, flattened per locale. */
async function readBack(tx: Parameters<typeof ensureDefaultSla>[0], locale: Locale) {
  const process = await tx.slaProcess.findUniqueOrThrow({
    where: { key: SLA_PROCESS_KEY },
    include: {
      translations: { where: { locale } },
      steps: { orderBy: { sort: "asc" }, include: { translations: { where: { locale } } } },
    },
  });
  return {
    kicker: process.translations[0]?.kicker,
    summary: process.translations[0]?.summary,
    sorts: process.steps.map((s) => s.sort),
    steps: process.steps.map((s) => ({
      badge: s.translations[0]?.badge,
      title: s.translations[0]?.title,
      description: s.translations[0]?.description,
      isFallback: false,
    })),
  };
}

describe("ensureDefaultSla (production init)", () => {
  it("creates the full default process, in every locale, when none exists", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await inRolledBackTx(async (tx) => {
      await tx.slaProcess.deleteMany({ where: { key: SLA_PROCESS_KEY } }); // cascades
      expect(await ensureDefaultSla(tx)).toBe("created");

      for (const locale of [Locale.en, Locale.tr, Locale.ru]) {
        const { sorts, ...text } = await readBack(tx, locale);
        expect(text).toEqual(slaTextFor(locale));
        expect(sorts).toEqual(SLA_STEPS.map((s) => s.sort));
      }
    });
  });

  it("leaves an existing (admin-edited) process completely untouched", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await inRolledBackTx(async (tx) => {
      // Simulate an owner edit, then a redeploy.
      await ensureDefaultSla(tx); // make sure one exists, whatever the dev DB holds
      const process = await tx.slaProcess.findUniqueOrThrow({ where: { key: SLA_PROCESS_KEY } });
      await tx.slaProcessTranslation.update({
        where: { processId_locale: { processId: process.id, locale: Locale.en } },
        data: { summary: "Edited by the owner" },
      });
      const stepsBefore = await tx.slaStep.count({ where: { processId: process.id } });

      expect(await ensureDefaultSla(tx)).toBe("exists");

      const after = await readBack(tx, Locale.en);
      expect(after.summary).toBe("Edited by the owner");
      expect(await tx.slaStep.count({ where: { processId: process.id } })).toBe(stepsBefore);
    });
  });
});
