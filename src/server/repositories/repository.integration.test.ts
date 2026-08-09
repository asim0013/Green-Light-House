// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { queryIndustries } from "./industry";
import { queryPublishedProjects } from "./project";
import { queryTopLevelCategories } from "./category";

/**
 * Integration tests — need a reachable Postgres (DATABASE_URL). They self-seed
 * throwaway rows, assert behaviour that only the database can prove, then clean
 * up. Skips cleanly when no DB is reachable so `npm test` stays green without one.
 *
 * These cover the failure modes a pure mapper test CANNOT catch (Story 1.7):
 *   - the `published`-only filter (the column defaults to `draft`)
 *   - NULLS LAST ordering on the nullable `delivered_at`
 *   - the `parent_id IS NULL` filter that keeps child categories out of the
 *     top-level signposts
 *   - that the `include`s are actually wired (a missing include silently makes
 *     every name fall back to its slug)
 */
const TEST_SLUG = "zzz-int-test-industry";
const PROJECT_PREFIX = "zzz-int-test-project-";
const CATEGORY_PREFIX = "zzz-int-test-category-";
let dbReachable = false;

async function cleanup() {
  await prisma.project.deleteMany({ where: { slug: { startsWith: PROJECT_PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: CATEGORY_PREFIX } } });
  await prisma.industry.deleteMany({ where: { slug: TEST_SLUG } });
}

beforeAll(async () => {
  // The whole setup (connectivity AND schema-dependent seed) must succeed for the
  // suite to run. If Postgres is unreachable OR reachable-but-unmigrated, any step
  // here throws and we leave dbReachable=false so the tests skip cleanly rather
  // than erroring the suite. CI applies migrations first, so it runs for real.
  try {
    await prisma.$queryRaw`SELECT 1`;
    await cleanup();

    const industry = await prisma.industry.create({
      data: {
        slug: TEST_SLUG,
        translations: {
          create: [
            { locale: "en", name: "Integration EN" },
            { locale: "tr", name: "Integration TR" },
          ],
        },
      },
    });

    // Ordering fixtures. The DATED row must outrank the UNDATED one; with a plain
    // `orderBy: { deliveredAt: "desc" }` Postgres puts NULLs FIRST and the undated
    // row would win — which is exactly what these assertions are here to catch.
    await prisma.project.create({
      data: {
        slug: `${PROJECT_PREFIX}dated`,
        status: "published",
        deliveredAt: new Date("2099-01-01T00:00:00.000Z"),
        industryId: industry.id,
        translations: { create: [{ locale: "en", title: "Dated EN" }] },
      },
    });
    await prisma.project.create({
      data: {
        slug: `${PROJECT_PREFIX}undated`,
        status: "published",
        deliveredAt: null,
        translations: { create: [{ locale: "en", title: "Undated EN" }] },
      },
    });
    await prisma.project.create({
      data: {
        slug: `${PROJECT_PREFIX}draft`,
        status: "draft",
        deliveredAt: new Date("2099-06-01T00:00:00.000Z"),
        translations: { create: [{ locale: "en", title: "Draft EN" }] },
      },
    });

    // Hierarchy fixture: a top-level parent with one child.
    await prisma.category.create({
      data: {
        slug: `${CATEGORY_PREFIX}parent`,
        translations: { create: [{ locale: "en", name: "Parent EN" }] },
        children: {
          create: [
            {
              slug: `${CATEGORY_PREFIX}child`,
              translations: { create: [{ locale: "en", name: "Child EN" }] },
            },
          ],
        },
      },
    });

    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) await cleanup();
  await prisma.$disconnect();
});

describe("industry repository (integration)", () => {
  it("returns the exact locale when present", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await queryIndustries("tr")).find((i) => i.slug === TEST_SLUG);
    expect(found?.name).toBe("Integration TR");
    expect(found?.isFallback).toBe(false);
  });

  it("falls back to EN (flagged) when the locale is missing", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await queryIndustries("ru")).find((i) => i.slug === TEST_SLUG);
    expect(found?.name).toBe("Integration EN");
    expect(found?.isFallback).toBe(true);
  });
});

describe("project repository (integration)", () => {
  it("excludes draft projects", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryPublishedProjects("en")).map((p) => p.slug);
    expect(slugs).toContain(`${PROJECT_PREFIX}dated`);
    expect(slugs).not.toContain(`${PROJECT_PREFIX}draft`);
  });

  it("ranks a dated project above an undated one (NULLS LAST, not Postgres' default)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryPublishedProjects("en")).map((p) => p.slug);
    const dated = slugs.indexOf(`${PROJECT_PREFIX}dated`);
    const undated = slugs.indexOf(`${PROJECT_PREFIX}undated`);
    expect(dated).toBeGreaterThanOrEqual(0);
    expect(undated).toBeGreaterThanOrEqual(0);
    expect(dated).toBeLessThan(undated);
  });

  it("honours the limit", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryPublishedProjects("en", 1)).toHaveLength(1);
  });

  it("resolves the nested industry name (proves the include is wired)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await queryPublishedProjects("tr")).find(
      (p) => p.slug === `${PROJECT_PREFIX}dated`,
    );
    expect(found?.industry).toEqual({ slug: TEST_SLUG, name: "Integration TR" });
    // The project itself has no TR title, so it falls back independently.
    expect(found?.title).toBe("Dated EN");
    expect(found?.isFallback).toBe(true);
  });

  it("returns a null industry for a project that has none", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await queryPublishedProjects("en")).find(
      (p) => p.slug === `${PROJECT_PREFIX}undated`,
    );
    expect(found?.industry).toBeNull();
    expect(found?.deliveredAt).toBeNull();
  });
});

describe("category repository (integration)", () => {
  it("lists top-level categories and excludes children", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryTopLevelCategories("en")).map((c) => c.slug);
    expect(slugs).toContain(`${CATEGORY_PREFIX}parent`);
    expect(slugs).not.toContain(`${CATEGORY_PREFIX}child`);
  });
});
