// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/db";
import { queryIndustries, queryIndustryBySlug } from "./industry";
import { queryPublishedProjects } from "./project";
import {
  queryTopLevelCategories,
  queryCategoriesByIndustry,
  queryCategoryTree,
  queryCategoryBySlug,
} from "./category";
import {
  queryProductsByIndustry,
  queryProductsByCategory,
  queryPublishedProducts,
  queryProductBySlug,
  queryRelatedProducts,
  queryAccessoriesForProduct,
  searchProducts,
  suggestProducts,
} from "./product";
import {
  queryCertificatesByIndustry,
  queryDocumentBySlug,
  queryDocumentsByProduct,
} from "./document";
import { queryServicesByIndustry, queryServices } from "./service";
import { queryManufacturerOptions } from "./series";

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
  await prisma.manufacturer.deleteMany({ where: { slug: { startsWith: MANUFACTURER_SLUG } } });
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

/** ---- Story 2.2: the catalog's reads ---- */

describe("products by category (integration)", () => {
  it("lists the published product of a category and EXCLUDES the draft one", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The two fixture categories split the cases: `published-only` holds the
    // published product, `draft-only` holds ONLY the draft.
    const published = (await queryProductsByCategory(`${CATEGORY_PREFIX}published-only`, "en")).map(
      (p) => p.slug,
    );
    expect(published).toContain(`${PRODUCT_PREFIX}published`);

    const draftOnly = await queryProductsByCategory(`${CATEGORY_PREFIX}draft-only`, "en");
    expect(draftOnly).toEqual([]);
  });

  it("returns an empty list for an unknown category slug", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryProductsByCategory("zzz-no-such-category", "en")).toEqual([]);
  });
});

describe("published products (integration)", () => {
  it("lists published products and never the draft", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slugs = (await queryPublishedProducts("en")).map((p) => p.slug);
    expect(slugs).toContain(`${PRODUCT_PREFIX}published`);
    expect(slugs).not.toContain(`${PRODUCT_PREFIX}draft`);
  });

  it("honours the cap", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryPublishedProducts("en", 1)).toHaveLength(1);
  });
});

describe("category tree (integration)", () => {
  it("nests the child under its parent with per-node DIRECT published counts", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const roots = await queryCategoryTree("en");
    const parent = roots.find((r) => r.slug === `${CATEGORY_PREFIX}parent`);
    expect(parent).toBeDefined();
    expect(parent!.children.map((c) => c.slug)).toContain(`${CATEGORY_PREFIX}child`);

    // The filtered _count is wired: `published-only` counts 1, `draft-only` 0 —
    // a draft never inflates a tile count (AC4's count-level half).
    const flat = (nodes: typeof roots): typeof roots =>
      nodes.flatMap((n) => [n, ...flat(n.children)]);
    const all = flat(roots);
    expect(all.find((n) => n.slug === `${CATEGORY_PREFIX}published-only`)!.publishedCount).toBe(1);
    expect(all.find((n) => n.slug === `${CATEGORY_PREFIX}draft-only`)!.publishedCount).toBe(0);
  });
});

describe("category by slug (integration)", () => {
  it("returns the category with its parent and children", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const child = await queryCategoryBySlug(`${CATEGORY_PREFIX}child`, "en");
    expect(child?.parent?.slug).toBe(`${CATEGORY_PREFIX}parent`);

    const parent = await queryCategoryBySlug(`${CATEGORY_PREFIX}parent`, "en");
    expect(parent?.parent).toBeNull();
    expect(parent?.children.map((c) => c.slug)).toContain(`${CATEGORY_PREFIX}child`);
  });

  it("returns NULL for an unknown slug rather than throwing", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    expect(await queryCategoryBySlug("zzz-no-such-category", "en")).toBeNull();
  });
});

/** ---- Story 2.3: the download handler's read + the datasheet join ---- */

describe("document by slug (integration)", () => {
  it("returns file fields for a PUBLIC document", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const found = await queryDocumentBySlug(`${DOCUMENT_PREFIX}public-cert`);
    expect(found).toEqual({
      slug: `${DOCUMENT_PREFIX}public-cert`,
      fileKey: "int/public-cert.pdf",
      mime: null,
      sizeBytes: null,
    });
  });

  it("returns NULL for a PRIVATE document — same path as unknown, deliberately", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // A prober must not be able to distinguish "exists but private" from
    // "does not exist" (unpublished items are never enumerable).
    expect(await queryDocumentBySlug(`${DOCUMENT_PREFIX}private-cert`)).toBeNull();
    expect(await queryDocumentBySlug("zzz-no-such-document")).toBeNull();
  });

  it("FR25a: swapping fileKey keeps the same slug serving — the URL never changes", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const slug = `${DOCUMENT_PREFIX}public-cert`;
    await prisma.document.update({
      where: { slug },
      data: { fileKey: "int/public-cert-v2.pdf", version: 2 },
    });
    const after = await queryDocumentBySlug(slug);
    expect(after?.fileKey).toBe("int/public-cert-v2.pdf");
    // Restore for other tests in this suite.
    await prisma.document.update({
      where: { slug },
      data: { fileKey: "int/public-cert.pdf", version: 1 },
    });
  });
});

describe("product card datasheet join (integration)", () => {
  it("carries the newest PUBLIC datasheet and ignores drafts/certs/private docs", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Fixture: two datasheets on the published product — v1 public, v2 public
    // (newest wins), plus a PRIVATE v3 that must never surface.
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}published` },
    });
    await prisma.document.createMany({
      data: [
        {
          slug: `${DOCUMENT_PREFIX}ds-v1`,
          type: "datasheet",
          fileKey: "int/ds-v1.pdf",
          version: 1,
          isPublic: true,
          productId: product.id,
        },
        {
          slug: `${DOCUMENT_PREFIX}ds-v2`,
          type: "datasheet",
          fileKey: "int/ds-v2.pdf",
          version: 2,
          isPublic: true,
          productId: product.id,
        },
        {
          slug: `${DOCUMENT_PREFIX}ds-v3-private`,
          type: "datasheet",
          fileKey: "int/ds-v3.pdf",
          version: 3,
          isPublic: false,
          productId: product.id,
        },
      ],
    });

    const cards = await queryProductsByIndustry(TEST_SLUG, "en");
    const card = cards.find((p) => p.slug === `${PRODUCT_PREFIX}published`);
    // Newest PUBLIC version wins: v2, not the private v3, not v1.
    expect(card?.datasheet?.slug).toBe(`${DOCUMENT_PREFIX}ds-v2`);
  });

  it("is null for a product with no public datasheet", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const cards = await queryPublishedProducts("en");
    // The seeded products other than fd-9500 have no datasheet at all; our
    // fixture product gained docs above, so assert on a seed product instead.
    const bare = cards.find((p) => p.slug === "as-60");
    if (bare) expect(bare.datasheet).toBeNull();
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

describe("product detail read (integration)", () => {
  it("returns a PUBLISHED product with manufacturer and category resolved", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const detail = await queryProductBySlug(`${PRODUCT_PREFIX}published`, "en");
    expect(detail?.slug).toBe(`${PRODUCT_PREFIX}published`);
    expect(detail?.name).toBe("Published product EN");
    // A missing `include` silently degrades these to the slug — assert the join.
    expect(detail?.manufacturer.name).toBe("Integration OEM");
    expect(detail?.category.slug).toBe(`${CATEGORY_PREFIX}published-only`);
  });

  it("returns NULL for a DRAFT product — the detail page must not publish work in progress", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The bug this test exists for: `queryProductBySlug` was a bare
    // findUnique(slug) with no status filter. It had zero callers, so nothing
    // noticed until Story 2.4 wired it to a public route.
    await expect(queryProductBySlug(`${PRODUCT_PREFIX}draft`, "en")).resolves.toBeNull();
  });

  it("returns NULL for an unknown slug", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await expect(queryProductBySlug("zzz-int-test-no-such-product", "en")).resolves.toBeNull();
  });
});

describe("documents by product (integration)", () => {
  it("lists PUBLIC documents only, newest version first within a type", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}published` },
    });
    await prisma.document.createMany({
      data: [
        {
          slug: `${DOCUMENT_PREFIX}pd-manual`,
          type: "manual",
          fileKey: "int/pd-manual.pdf",
          version: 1,
          isPublic: true,
          productId: product.id,
        },
        {
          slug: `${DOCUMENT_PREFIX}pd-secret`,
          type: "manual",
          fileKey: "int/pd-secret.pdf",
          version: 9,
          isPublic: false,
          productId: product.id,
        },
        // The ordering fixture is SELF-SEEDED (2.4 review). The first version
        // borrowed ds-v1/ds-v2 from the datasheet-join test in another describe
        // block and guarded the assertion with `if (datasheets.length > 1)` —
        // which made it vacuously pass under `-t "documents by product"` while a
        // `version: "asc"` mutation survived. Versions 94/95 sit above anything
        // any other fixture creates, so the expectation is unconditional and
        // holds whether or not the join test ran first.
        {
          slug: `${DOCUMENT_PREFIX}pd-ds-old`,
          type: "datasheet",
          fileKey: "int/pd-ds-old.pdf",
          version: 94,
          isPublic: true,
          productId: product.id,
        },
        {
          slug: `${DOCUMENT_PREFIX}pd-ds-new`,
          type: "datasheet",
          fileKey: "int/pd-ds-new.pdf",
          version: 95,
          isPublic: true,
          productId: product.id,
        },
      ],
    });

    const docs = await queryDocumentsByProduct(`${PRODUCT_PREFIX}published`, "en");
    const slugs = docs.map((d) => d.slug);
    expect(slugs).toContain(`${DOCUMENT_PREFIX}pd-manual`);
    // Private documents are never enumerable — the same rule the download
    // handler enforces (Story 2.3).
    expect(slugs).not.toContain(`${DOCUMENT_PREFIX}pd-secret`);
    // Highest version of a type comes first — UNCONDITIONAL, on this test's own
    // two-version fixture.
    const datasheets = docs.filter((d) => d.type === "datasheet").map((d) => d.slug);
    expect(datasheets[0]).toBe(`${DOCUMENT_PREFIX}pd-ds-new`);
    expect(datasheets[1]).toBe(`${DOCUMENT_PREFIX}pd-ds-old`);
  });

  it("is empty for a product with no public documents", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await expect(queryDocumentsByProduct(`${PRODUCT_PREFIX}draft`, "en")).resolves.toEqual([]);
  });
});

describe("related products (integration)", () => {
  it("returns published category siblings, never the product itself, never drafts", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const self = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}published` },
    });
    const manufacturerId = self.manufacturerId;
    // One published sibling and one DRAFT sibling in the SAME category.
    await prisma.product.create({
      data: {
        slug: `${PRODUCT_PREFIX}sibling-pub`,
        model: "INT-SIB-PUB",
        status: "published",
        manufacturerId,
        categoryId: self.categoryId,
        translations: { create: [{ locale: "en", name: "Sibling published EN" }] },
      },
    });
    await prisma.product.create({
      data: {
        slug: `${PRODUCT_PREFIX}sibling-draft`,
        model: "INT-SIB-DRAFT",
        status: "draft",
        manufacturerId,
        categoryId: self.categoryId,
        translations: { create: [{ locale: "en", name: "Sibling draft EN" }] },
      },
    });

    const related = await queryRelatedProducts(`${PRODUCT_PREFIX}published`, "en");
    const slugs = related.map((p) => p.slug);
    expect(slugs).toContain(`${PRODUCT_PREFIX}sibling-pub`);
    expect(slugs).not.toContain(`${PRODUCT_PREFIX}sibling-draft`);
    expect(slugs).not.toContain(`${PRODUCT_PREFIX}published`);
  });

  it("is empty when every category sibling is unpublished", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // `${PRODUCT_PREFIX}draft` sits alone in the draft-only category.
    await expect(queryRelatedProducts(`${PRODUCT_PREFIX}draft`, "en")).resolves.toEqual([]);
  });
});

describe("accessory compatibility (integration)", () => {
  it("returns published accessories — the phased relation has ZERO rows in the seed", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // `accessory_compatibilities` is empty repo-wide, so the POPULATED branch is
    // unprovable without self-seeding it here (the Story 2.1 pattern).
    const self = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}published` },
    });
    const accessory = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}sibling-pub` },
    });
    const draftAccessory = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}sibling-draft` },
    });
    await prisma.accessoryCompatibility.createMany({
      data: [
        { productId: self.id, accessoryProductId: accessory.id },
        // A DRAFT accessory must stay hidden: the seed's real-world temptation is
        // `wc-95` ("fits FD-9500"), which is draft.
        { productId: self.id, accessoryProductId: draftAccessory.id },
      ],
    });

    const accessories = await queryAccessoriesForProduct(`${PRODUCT_PREFIX}published`, "en");
    const slugs = accessories.map((p) => p.slug);
    expect(slugs).toContain(`${PRODUCT_PREFIX}sibling-pub`);
    expect(slugs).not.toContain(`${PRODUCT_PREFIX}sibling-draft`);
  });

  it("is empty for a product with no accessory rows", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await expect(queryAccessoriesForProduct(`${PRODUCT_PREFIX}draft`, "en")).resolves.toEqual([]);
  });
});

describe("product search (integration)", () => {
  it("finds a product by exact model, and by every paste variant", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // UJ2's opening beat is a PASTED model string. The normalized expression
    // index exists so all of these hit FD-9500; a plain trgm index could not
    // serve the hyphen-stripped forms.
    for (const q of ["FD-9500", "fd9500", "FD 9500", "fd-9500"]) {
      const { products, total } = await searchProducts(q, {}, "en");
      const slugs = products.map((p) => p.slug);
      expect(slugs, `query "${q}"`).toContain("fd-9500");
      expect(total).toBeGreaterThanOrEqual(1);
    }
  });

  it("matches translated names in the ACTIVE locale (FR19, TR half)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // fd-9500's TR name is "Üç-IR (IR³) Alev Dedektörü".
    const { products } = await searchProducts("Alev", {}, "tr");
    expect(products.map((p) => p.slug)).toContain("fd-9500");
  });

  it("matches EN fallback names from a non-EN locale (FR19, fallback half)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // gd-410 has NO TR name; its EN name is "GD-410 Fixed Gas Detector". A TR
    // buyer typing an English word must still find it — the fallback contract
    // renders EN names on /tr, so search must match what the page shows.
    const { products } = await searchProducts("Fixed Gas", {}, "tr");
    const hit = products.find((p) => p.slug === "gd-410");
    expect(hit).toBeDefined();
    expect(hit?.isFallback).toBe(true);
  });

  it("NEVER returns drafts — by model or by name", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // wc-95 is the seeded draft ("Weather Cover WC-95").
    for (const q of ["WC-95", "wc95", "Weather"]) {
      const { products } = await searchProducts(q, {}, "en");
      expect(
        products.map((p) => p.slug),
        `query "${q}"`,
      ).not.toContain("wc-95");
    }
  });

  it("does not treat LIKE wildcards in the query as wildcards", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // "%" would match everything if unescaped; a lone wildcard must match NOTHING
    // (after normalization it is empty on the model side and escaped on the name side).
    const { products } = await searchProducts("%%%", {}, "en");
    expect(products).toEqual([]);
  });

  it("filters narrow results: manufacturer, series, and composition with q (FR17)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // "detector" matches fd-9500, fd-9300 (flame detectors) and gd-410 (gas
    // detector) by EN name. Narrowing by manufacturer=gastec leaves only gd-410.
    const broad = await searchProducts("detector", {}, "en");
    expect(broad.products.length).toBeGreaterThanOrEqual(3);

    const narrowed = await searchProducts("detector", { manufacturerSlug: "gastec" }, "en");
    expect(narrowed.products.map((p) => p.slug)).toEqual(["gd-410"]);
    expect(narrowed.total).toBe(1);

    // Series filter: flameguard carries fd-9300 + fd-9500.
    const bySeries = await searchProducts(null, { seriesSlug: "flameguard" }, "en");
    expect(bySeries.products.map((p) => p.slug).sort()).toEqual(["fd-9300", "fd-9500"]);

    // Category composes with series.
    const combined = await searchProducts(
      null,
      {
        seriesSlug: "flameguard",
        categorySlug: "flame-detectors",
      },
      "en",
    );
    expect(combined.products.map((p) => p.slug).sort()).toEqual(["fd-9300", "fd-9500"]);
  });

  it("unknown filter slugs return empty, never crash", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const { products, total } = await searchProducts(null, { manufacturerSlug: "zz-nope" }, "en");
    expect(products).toEqual([]);
    expect(total).toBe(0);
  });
});

describe("search suggestions (integration)", () => {
  it("suggests the near-miss model for a truncated or misspelled query (FR17a)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    for (const q of ["fd-950", "fd9500x"]) {
      const suggestions = await suggestProducts(q, "en");
      expect(
        suggestions.map((s) => s.slug),
        `query "${q}"`,
      ).toContain("fd-9500");
    }
  });

  it("returns NOTHING for garbage — suggestions must not hallucinate", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await expect(suggestProducts("xyzzy-plugh", "en")).resolves.toEqual([]);
  });

  it("never suggests a draft", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const suggestions = await suggestProducts("wc-9", "en");
    expect(suggestions.map((s) => s.slug)).not.toContain("wc-95");
  });
});

describe("search input hardening (integration)", () => {
  it("survives a trailing backslash — the LIKE ESCAPE syntax must not 500", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Unescaped, 'foo\' produces `LIKE '%foo\%' ESCAPE '\'` — an invalid escape
    // sequence Postgres rejects. Caught by lint in dev (a heredoc had eaten the
    // escapes); this pins the repaired behaviour.
    await expect(searchProducts("detector\\", {}, "en")).resolves.toBeDefined();
    // And an underscore is a literal, not a single-char wildcard.
    const { products } = await searchProducts("F_-9500", {}, "en");
    expect(products.map((p) => p.slug)).not.toContain("fd-9300");
  });
});

describe("search: FR19 locale scoping and escaping (integration)", () => {
  it("a TR-ONLY name does NOT match from /en — the locale scope is real", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The mutation that survived the whole 2.5 suite: dropping IN (locale,'en')
    // from the name arm. fd-9500's TR name is "Üç-IR (IR³) Alev Dedektörü" and it
    // has NO EN name containing "Dedektörü", so this word must be findable from
    // /tr and invisible from /en.
    const fromTr = await searchProducts("Dedektörü", {}, "tr");
    expect(fromTr.products.map((p) => p.slug)).toContain("fd-9500");

    const fromEn = await searchProducts("Dedektörü", {}, "en");
    expect(fromEn.products.map((p) => p.slug)).not.toContain("fd-9500");
  });

  it("LIKE ESCAPE is ACTIVE: a literal underscore in a name is findable", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The shipped source wrote ESCAPE '\' inside a template literal, which cooks
    // to ESCAPE '' — the SQL form that DISABLES escaping. escapeLike's backslashes
    // then became literal characters no name contains, so a name holding "_" or
    // "%" was unfindable. The old "pinning" tests passed against BOTH states.
    const product = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}published` },
    });
    await prisma.product.create({
      data: {
        slug: `${PRODUCT_PREFIX}escape`,
        model: "ZZESC-1",
        status: "published",
        manufacturerId: product.manufacturerId,
        categoryId: product.categoryId,
        translations: { create: [{ locale: "en", name: "ZZ_Cover 50% Special" }] },
      },
    });

    // A literal underscore must match itself...
    const underscore = await searchProducts("ZZ_Cover", {}, "en");
    expect(underscore.products.map((p) => p.slug)).toContain(`${PRODUCT_PREFIX}escape`);
    // ...and a literal percent too.
    const percent = await searchProducts("50%", {}, "en");
    expect(percent.products.map((p) => p.slug)).toContain(`${PRODUCT_PREFIX}escape`);
    // But a bare wildcard still matches NOTHING — no over-match.
    const wildcard = await searchProducts("%%%", {}, "en");
    expect(wildcard.products).toEqual([]);
  });

  it("total is the UNCAPPED match count even when the page is capped", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The grid caps; the toolbar number must not. Capping to 1 on a query that
    // matches several proves the window count is independent of the page size.
    const broad = await searchProducts("detector", {}, "en");
    expect(broad.total).toBeGreaterThan(1);

    const capped = await searchProducts("detector", {}, "en", 1);
    expect(capped.products).toHaveLength(1);
    expect(capped.total).toBe(broad.total);
  });

  it("suggestions respect the ACTIVE FILTERS — never suggest what the facets exclude", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // Unfiltered, a near-miss suggests fd-9500...
    const open = await suggestProducts("fd9500x", "en");
    expect(open.map((s) => s.slug)).toContain("fd-9500");
    // ...but under a manufacturer facet that excludes it, suggesting it would be
    // echoing the user's own query back at them (2.5 review).
    const scoped = await suggestProducts("fd9500x", "en", { manufacturerSlug: "gastec" });
    expect(scoped.map((s) => s.slug)).not.toContain("fd-9500");
  });
});

describe("manufacturer facet options (integration)", () => {
  it("lists only manufacturers that HAVE a published product", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // The seeded zzz- manufacturer owns only the self-seeded fixtures; every
    // seeded brand owns a published product, so the guard is proven by a
    // manufacturer with a DRAFT-only catalogue.
    const draftOnly = await prisma.manufacturer.create({
      data: {
        slug: `${MANUFACTURER_SLUG}-draftonly`,
        translations: { create: [{ locale: "en", name: "Draft Only OEM" }] },
      },
    });
    const seedProduct = await prisma.product.findUniqueOrThrow({
      where: { slug: `${PRODUCT_PREFIX}published` },
    });
    await prisma.product.create({
      data: {
        slug: `${PRODUCT_PREFIX}draftonly`,
        model: "ZZDO-1",
        status: "draft",
        manufacturerId: draftOnly.id,
        categoryId: seedProduct.categoryId,
        translations: { create: [{ locale: "en", name: "Draft only product" }] },
      },
    });

    const options = await queryManufacturerOptions("en");
    const slugs = options.map((o) => o.slug);
    expect(slugs).toContain("gastec");
    expect(slugs).not.toContain(`${MANUFACTURER_SLUG}-draftonly`);
  });
});

describe("all services (integration)", () => {
  it("returns EVERY service — there is no status column to filter on", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const services = await queryServices("en");
    const slugs = services.map((s) => s.slug);
    // FR23's five competencies, one row each (Story 2.6 decision Q1).
    for (const slug of [
      "project-kitting",
      "technical-selection",
      "tender-support",
      "import-export",
      "logistics",
    ]) {
      expect(slugs, `missing ${slug}`).toContain(slug);
    }
    // The retired merged row must be gone — the seed deletes it.
    expect(slugs).not.toContain("kitting-logistics");
    // Deterministic order (slug asc), the house rule for cacheable reads.
    expect(slugs).toEqual([...slugs].sort());
  });

  it("resolves names AND descriptions for the active locale", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const services = await queryServices("en");
    const kitting = services.find((s) => s.slug === "project-kitting");
    expect(kitting?.name).toBe("Project kitting & configuration");
    // Story 2.6 decision Q2: descriptions were NULL on every seeded row, which
    // made the page thin by our own predicate. A missing include would silently
    // return null here.
    expect(kitting?.description).toBeTruthy();
    expect(kitting?.isFallback).toBe(false);
  });

  it("falls back to EN with the flag set for a non-EN locale (FR34a)", async (ctx) => {
    if (!dbReachable) return ctx.skip();
    // No service carries a TR translation, so every row falls back visibly.
    const services = await queryServices("tr");
    expect(services.length).toBeGreaterThan(0);
    for (const service of services) {
      expect(service.isFallback, service.slug).toBe(true);
    }
  });
});
