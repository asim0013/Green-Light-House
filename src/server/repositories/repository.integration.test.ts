// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { listIndustries } from "./industry";

/**
 * Integration test — needs a reachable Postgres (DATABASE_URL). It self-seeds a
 * throwaway industry, asserts locale resolution + EN fallback through the
 * repository, then cleans up. Skips cleanly when no DB is reachable so
 * `npm test` stays green without one.
 */
const TEST_SLUG = "zzz-int-test-industry";
let dbReachable = false;

beforeAll(async () => {
  // The whole setup (connectivity AND schema-dependent seed) must succeed for the
  // suite to run. If Postgres is unreachable OR reachable-but-unmigrated, any step
  // here throws and we leave dbReachable=false so the tests skip cleanly rather
  // than erroring the suite. CI applies migrations first, so it runs for real.
  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.industry.deleteMany({ where: { slug: TEST_SLUG } });
    await prisma.industry.create({
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
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

afterAll(async () => {
  if (dbReachable) await prisma.industry.deleteMany({ where: { slug: TEST_SLUG } });
  await prisma.$disconnect();
});

describe("industry repository (integration)", () => {
  it("returns the exact locale when present", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await listIndustries("tr")).find((i) => i.slug === TEST_SLUG);
    expect(found?.name).toBe("Integration TR");
    expect(found?.isFallback).toBe(false);
  });

  it("falls back to EN (flagged) when the locale is missing", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await listIndustries("ru")).find((i) => i.slug === TEST_SLUG);
    expect(found?.name).toBe("Integration EN");
    expect(found?.isFallback).toBe(true);
  });
});
