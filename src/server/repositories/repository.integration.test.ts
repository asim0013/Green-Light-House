// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { queryIndustries, queryIndustryBySlug } from "./industry";
import { queryPublishedProjects } from "./project";
import { queryTopLevelCategories, queryCategoriesByIndustry } from "./category";
import { queryProductsByIndustry } from "./product";
import { queryCertificatesByIndustry } from "./document";
import { queryServicesByIndustry } from "./service";

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
const PRODUCT_PREFIX = "zzz-int-test-product-";
const DOCUMENT_PREFIX = "zzz-int-test-document-";
const SERVICE_PREFIX = "zzz-int-test-service-";
const MANUFACTURER_SLUG = "zzz-int-test-manufacturer";
let dbReachable = false;

async function cleanup() {
  // Order matters: products reference the manufacturer and categories, and the
  // join rows cascade from their owning side.
  await prisma.document.deleteMany({ where: { slug: { startsWith: DOCUMENT_PREFIX } } });
  await prisma.service.deleteMany({ where: { slug: { startsWith: SERVICE_PREFIX } } });
  await prisma.project.deleteMany({ where: { slug: { startsWith: PROJECT_PREFIX } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: PRODUCT_PREFIX } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: CATEGORY_PREFIX } } });
  await prisma.manufacturer.deleteMany({ where: { slug: MANUFACTURER_SLUG } });
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

    // ---- Story 2.1 fixtures: the industry landing page's four blocks ----
    //
    // These exist because the SEEDED data cannot prove the filters. Measured on
    // the current seed: the one draft product (`wc-95`) is attached to NO industry,
    // and `document_industries` has ZERO rows — so "a draft product linked to an
    // industry is excluded" and "a private certificate is excluded" have no
    // fixtures at all. Self-seeding them here is what makes AC5 assertable.
    const manufacturer = await prisma.manufacturer.create({
      data: {
        slug: MANUFACTURER_SLUG,
        translations: { create: [{ locale: "en", name: "Integration OEM" }] },
      },
    });

    const productCategory = await prisma.category.create({
      data: {
        slug: `${CATEGORY_PREFIX}published-only`,
        translations: { create: [{ locale: "en", name: "Published-only category EN" }] },
      },
    });
    const draftOnlyCategory = await prisma.category.create({
      data: {
        slug: `${CATEGORY_PREFIX}draft-only`,
        translations: { create: [{ locale: "en", name: "Draft-only category EN" }] },
      },
    });

    await prisma.product.create({
      data: {
        slug: `${PRODUCT_PREFIX}published`,
        model: "INT-PUB-1",
        status: "published",
        manufacturerId: manufacturer.id,
        categoryId: productCategory.id,
        attributes: { detection: "Triple-IR", response: "< 5 s", enclosure: "IP66" },
        translations: { create: [{ locale: "en", name: "Published product EN" }] },
        industries: { create: [{ industryId: industry.id }] },
      },
    });
    // THE negative fixture for AC5: draft, and deliberately linked to the industry.
    await prisma.product.create({
      data: {
        slug: `${PRODUCT_PREFIX}draft`,
        model: "INT-DRAFT-1",
        status: "draft",
        manufacturerId: manufacturer.id,
        categoryId: draftOnlyCategory.id,
        translations: { create: [{ locale: "en", name: "Draft product EN" }] },
        industries: { create: [{ industryId: industry.id }] },
      },
    });

    await prisma.document.create({
      data: {
        slug: `${DOCUMENT_PREFIX}public-cert`,
        type: "certificate",
        fileKey: "int/public-cert.pdf",
        isPublic: true,
        translations: { create: [{ locale: "en", title: "Public certificate EN" }] },
        industries: { create: [{ industryId: industry.id }] },
      },
    });
    await prisma.document.create({
      data: {
        slug: `${DOCUMENT_PREFIX}private-cert`,
        type: "certificate",
        fileKey: "int/private-cert.pdf",
        isPublic: false,
        translations: { create: [{ locale: "en", title: "Private certificate EN" }] },
        industries: { create: [{ industryId: industry.id }] },
      },
    });
    // A public document of the WRONG type — the certificates block must not list it.
    await prisma.document.create({
      data: {
        slug: `${DOCUMENT_PREFIX}datasheet`,
        type: "datasheet",
        fileKey: "int/datasheet.pdf",
        isPublic: true,
        translations: { create: [{ locale: "en", title: "Datasheet EN" }] },
        industries: { create: [{ industryId: industry.id }] },
      },
    });

    await prisma.service.create({
      data: {
        slug: `${SERVICE_PREFIX}attached`,
        translations: { create: [{ locale: "en", name: "Attached service EN" }] },
        industries: { create: [{ industryId: industry.id }] },
      },
    });
    // Attached to NO industry — proves the join actually narrows.
    await prisma.service.create({
      data: {
        slug: `${SERVICE_PREFIX}unattached`,
        translations: { create: [{ locale: "en", name: "Unattached service EN" }] },
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

/** ---- Story 2.1: the industry landing page's reads ---- */

describe("industry detail read (integration)", () => {
  it("returns the industry for a known slug", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = await queryIndustryBySlug(TEST_SLUG, "tr");
    expect(found?.slug).toBe(TEST_SLUG);
    expect(found?.name).toBe("Integration TR");
  });

  it("returns NULL for an unknown slug rather than throwing", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The page's not-found branch is driven entirely by this null.
    expect(await queryIndustryBySlug("zzz-no-such-industry-at-all", "en")).toBeNull();
  });

  it("does not match on a partial or differently-cased slug", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryIndustryBySlug(TEST_SLUG.toUpperCase(), "en")).toBeNull();
    expect(await queryIndustryBySlug(TEST_SLUG.slice(0, -1), "en")).toBeNull();
  });
});

describe("products by industry (integration)", () => {
  it("EXCLUDES a draft product that IS linked to the industry (AC5)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // `status` defaults to `draft`, so a missing filter leaks unpublished catalogue
    // entries onto a public page. The seed cannot prove this — its only draft
    // product is attached to no industry — so the fixture above supplies one.
    const slugs = (await queryProductsByIndustry(TEST_SLUG, "en")).map((p) => p.slug);
    expect(slugs).toContain(`${PRODUCT_PREFIX}published`);
    expect(slugs).not.toContain(`${PRODUCT_PREFIX}draft`);
  });

  it("returns nothing for an industry with no products", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryProductsByIndustry("zzz-no-such-industry-at-all", "en")).toEqual([]);
  });

  it("resolves the manufacturer name (proves the include is wired)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await queryProductsByIndustry(TEST_SLUG, "en")).find(
      (p) => p.slug === `${PRODUCT_PREFIX}published`,
    );
    expect(found?.manufacturer).toEqual({
      slug: MANUFACTURER_SLUG,
      name: "Integration OEM",
      isFallback: false,
    });
  });

  it("carries the manufacturer's OWN fallback flag, independent of the product's", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The fixture manufacturer has an EN translation only, so in Turkish its name
    // falls back — and the card must mark THAT string, not the product's. An earlier
    // version resolved this flag and discarded it, so a fallen-back OEM name rendered
    // with no lang="en" and no visible notice (FR34a / AC6).
    const found = (await queryProductsByIndustry(TEST_SLUG, "tr")).find(
      (p) => p.slug === `${PRODUCT_PREFIX}published`,
    );
    expect(found?.manufacturer.isFallback).toBe(true);
    expect(found?.manufacturer.name).toBe("Integration OEM");
  });

  it("derives at most two spec rows, key-sorted, from the JSONB attributes", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = (await queryProductsByIndustry(TEST_SLUG, "en")).find(
      (p) => p.slug === `${PRODUCT_PREFIX}published`,
    );
    // Three attributes were seeded as {detection, response, enclosure}; Postgres
    // stores jsonb keys in ITS order, not ours, which is exactly why `toSpecRows`
    // sorts. Two rows, alphabetically first — regardless of how jsonb kept them.
    expect(found?.specs).toEqual([
      { label: "Detection", value: "Triple-IR" },
      { label: "Enclosure", value: "IP66" },
    ]);
  });

  it("honours the limit", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryProductsByIndustry(TEST_SLUG, "en", 1)).toHaveLength(1);
  });
});

describe("certificates by industry (integration)", () => {
  it("lists a public certificate attached to the industry", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryCertificatesByIndustry(TEST_SLUG, "en")).map((d) => d.slug);
    expect(slugs).toContain(`${DOCUMENT_PREFIX}public-cert`);
  });

  it("EXCLUDES a certificate marked not public", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // `is_public` defaults to TRUE here, so this filter is easy to omit and its
    // absence would be invisible until a deliberately-private document leaked.
    const slugs = (await queryCertificatesByIndustry(TEST_SLUG, "en")).map((d) => d.slug);
    expect(slugs).not.toContain(`${DOCUMENT_PREFIX}private-cert`);
  });

  it("EXCLUDES a public document of a different type", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryCertificatesByIndustry(TEST_SLUG, "en")).map((d) => d.slug);
    expect(slugs).not.toContain(`${DOCUMENT_PREFIX}datasheet`);
  });

  it("returns an empty list for an industry with no documents", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // This is EVERY industry on the current seed — document_industries has 0 rows.
    expect(await queryCertificatesByIndustry("zzz-no-such-industry-at-all", "en")).toEqual([]);
  });
});

describe("services by industry (integration)", () => {
  it("lists only services joined to the industry", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryServicesByIndustry(TEST_SLUG, "en")).map((s) => s.slug);
    expect(slugs).toContain(`${SERVICE_PREFIX}attached`);
    expect(slugs).not.toContain(`${SERVICE_PREFIX}unattached`);
  });
});

describe("projects by industry (integration)", () => {
  it("narrows to the industry and still excludes drafts", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryPublishedProjects("en", undefined, TEST_SLUG)).map((p) => p.slug);
    expect(slugs).toContain(`${PROJECT_PREFIX}dated`);
    // Attached to no industry — must not appear under this one.
    expect(slugs).not.toContain(`${PROJECT_PREFIX}undated`);
    expect(slugs).not.toContain(`${PROJECT_PREFIX}draft`);
  });

  it("leaves the unfiltered read unchanged (Story 1.7's contract)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryPublishedProjects("en")).map((p) => p.slug);
    expect(slugs).toContain(`${PROJECT_PREFIX}dated`);
    expect(slugs).toContain(`${PROJECT_PREFIX}undated`);
  });
});

describe("categories by industry (integration)", () => {
  it("lists the category of a published product in the industry", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryCategoriesByIndustry(TEST_SLUG, "en")).map((c) => c.slug);
    expect(slugs).toContain(`${CATEGORY_PREFIX}published-only`);
  });

  it("EXCLUDES a category whose only product in this industry is a draft", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // "What we supply" is derived from the published catalogue, so it can never
    // advertise a category with nothing behind it.
    const slugs = (await queryCategoriesByIndustry(TEST_SLUG, "en")).map((c) => c.slug);
    expect(slugs).not.toContain(`${CATEGORY_PREFIX}draft-only`);
  });
});
