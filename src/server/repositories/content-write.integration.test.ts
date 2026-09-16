// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import {
  createIndustry,
  updateIndustryTranslations,
  getIndustryForEdit,
  industryReferenceCounts,
  deleteIndustry,
} from "./industry";
import { createService, serviceLinkedIndustrySlugs, deleteService } from "./service";
import { createProject, updateProject, getProjectForEdit, deleteProject } from "./project";

/**
 * Round-trip proof for the Story 4.4 editorial writes against real Postgres.
 * `zzz-int-test-44-` prefix; skips locally if the DB is unreachable, throws in CI.
 */
const P = "zzz-int-test-44-";
let dbReachable = true;

async function cleanup() {
  await prisma.project.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: P } } });
  await prisma.industry.deleteMany({ where: { slug: { startsWith: P } } });
}

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();
  } catch (err) {
    if (process.env.CI) throw err;
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await prisma.$disconnect();
});

describe("industry writes", () => {
  it("round-trips translations and clears a locale on update", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id, slug } = await createIndustry({
      slug: `${P}oil-gas`,
      translations: [
        { locale: "en", name: "Oil & Gas", description: "EN" },
        { locale: "tr", name: "Petrol & Gaz", description: null },
        { locale: "ru", name: "Нефть и газ", description: null },
      ],
    });
    expect((await getIndustryForEdit(id))?.translations).toHaveLength(3);

    const updatedSlug = await updateIndustryTranslations(id, [
      { locale: "en", name: "Oil & Gas", description: "EN2" },
    ]);
    expect(updatedSlug).toBe(slug);
    expect((await getIndustryForEdit(id))?.translations.map((t) => t.locale)).toEqual(["en"]);
  });
});

describe("service links + industry delete-refusal", () => {
  it("reads a service's linked industry slugs; blocks industry delete while referenced", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id: iId, slug: iSlug } = await createIndustry({
      slug: `${P}marine`,
      translations: [{ locale: "en", name: "Marine", description: null }],
    });
    const { id: sId } = await createService({
      slug: `${P}commissioning`,
      translations: [{ locale: "en", name: "Commissioning", description: null }],
    });
    await prisma.serviceIndustry.create({ data: { serviceId: sId, industryId: iId } });

    expect(await serviceLinkedIndustrySlugs(sId)).toEqual([iSlug]);
    expect((await industryReferenceCounts(iId)).services).toBe(1);

    // Deleting the service cascades its link away, then the industry is deletable.
    await deleteService(sId);
    expect(await serviceLinkedIndustrySlugs(sId)).toEqual([]);
    expect((await industryReferenceCounts(iId)).services).toBe(0);
    expect(await deleteIndustry(iId)).toBe(iSlug);
  });
});

describe("project writes", () => {
  it("round-trips 5 translated fields + scalars; re-parent reports old+new industry slugs", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { id: iId, slug: iSlug } = await createIndustry({
      slug: `${P}power`,
      translations: [{ locale: "en", name: "Power", description: null }],
    });
    const { id: pId, industrySlugs: createdSlugs } = await createProject({
      slug: `${P}marmara`,
      industryId: iId,
      status: "draft",
      deliveredAt: new Date("2026-03-01"),
      leadTimeWeeks: 6,
      translations: [
        {
          locale: "en",
          title: "Marmara LNG",
          description: "EN",
          outcome: "done",
          scope: "F&G",
          location: "Marmara",
        },
        {
          locale: "tr",
          title: "Marmara LNG TR",
          description: null,
          outcome: null,
          scope: null,
          location: "Marmara, Türkiye",
        },
      ],
    });
    expect(createdSlugs).toEqual([iSlug]);

    const p = await getProjectForEdit(pId);
    expect(p?.status).toBe("draft");
    expect(p?.deliveredAt).toBe("2026-03-01");
    expect(p?.leadTimeWeeks).toBe(6);
    expect(p?.translations.map((t) => t.locale).sort()).toEqual(["en", "tr"]);
    expect(p?.translations.find((t) => t.locale === "tr")?.location).toBe("Marmara, Türkiye");

    // Re-parent to no industry → the purge set must include the OLD industry slug.
    const upd = await updateProject(
      pId,
      { industryId: null, status: "published", deliveredAt: null, leadTimeWeeks: null },
      [
        {
          locale: "en",
          title: "Marmara LNG",
          description: null,
          outcome: null,
          scope: null,
          location: null,
        },
      ],
    );
    expect(upd.ok).toBe(true);
    expect(upd.industrySlugs).toEqual([iSlug]);
    const after = await getProjectForEdit(pId);
    expect(after?.industryId).toBeNull();
    expect(after?.translations).toHaveLength(1);

    await deleteProject(pId);
    expect(await getProjectForEdit(pId)).toBeNull();
    await deleteIndustry(iId);
  });
});
