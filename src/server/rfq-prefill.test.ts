import { describe, it, expect, vi, beforeEach } from "vitest";

const queryProjectPrefill = vi.fn();
const getProductBySlug = vi.fn();
const listCategoryTree = vi.fn();

// vitest LOADS `.env`, so an unmocked repository here would reach live Postgres.
vi.mock("@/server/repositories/project", () => ({
  queryProjectPrefill: (slug: string, locale: string) => queryProjectPrefill(slug, locale),
}));
vi.mock("@/server/repositories/product", () => ({
  getProductBySlug: (slug: string, locale: string) => getProductBySlug(slug, locale),
}));
vi.mock("@/server/repositories/category", () => ({
  listCategoryTree: (locale: string) => listCategoryTree(locale),
}));

const { resolveRfqPrefill, PREFILL_CHIP_BUDGET } = await import("./rfq-prefill");

/**
 * The doorway RESOLVER (Story 3.4), added by that story's review.
 *
 * ⚠️ THIS FILE DID NOT EXIST, and Task 10 ("P5 on every new gate") was ticked
 * anyway. `rfq-prefill.ts` owns two gates nothing exercised — the chip BUDGET
 * and the DEDUPE — plus the `resolved`/`doorway` split that the review added.
 * Every test below names the mutation that reddens it.
 *
 * The repositories are mocked, so these are decisions about resolution rather
 * than assertions about the seed: they cannot drift when a fixture changes.
 */

const INDUSTRIES = [
  { id: "ind-1", slug: "oil-gas", name: "Oil & Gas", description: null, isFallback: false },
  { id: "ind-2", slug: "energy", name: "Energy", description: null, isFallback: true },
];

function category(slug: string, name = slug) {
  return { slug, name, isFallback: false };
}

beforeEach(() => {
  queryProjectPrefill.mockReset();
  getProductBySlug.mockReset();
  listCategoryTree.mockReset();
  queryProjectPrefill.mockResolvedValue(null);
  getProductBySlug.mockResolvedValue(null);
  listCategoryTree.mockResolvedValue([]);
});

describe("the chip BUDGET", () => {
  it("caps pre-loaded chips at PREFILL_CHIP_BUDGET, below the schema's cap of 20", async () => {
    // ⚠️ THE FAILURE THIS PREVENTS is not a cosmetic one: `rfqSchema` REJECTS
    // more than 20 equipment items, so a project linking products across many
    // categories would otherwise pre-fill an ALREADY-INVALID form — the buyer
    // arrives at something that refuses to submit and cannot see why.
    //
    // P5: delete the `equipment.length >= PREFILL_CHIP_BUDGET` guard in `push`
    // and this reddens at 25.
    queryProjectPrefill.mockResolvedValue({
      industry: null,
      categories: Array.from({ length: 25 }, (_, i) => category(`cat-${i}`)),
    });

    const prefill = await resolveRfqPrefill({ project: "big" }, "en", INDUSTRIES);

    expect(prefill?.equipment).toHaveLength(PREFILL_CHIP_BUDGET);
    expect(PREFILL_CHIP_BUDGET).toBeLessThan(20);
    // The fallback array must stay parallel or the banner marks the wrong name.
    expect(prefill?.equipmentFallback).toHaveLength(PREFILL_CHIP_BUDGET);
  });
});

describe("the DEDUPE", () => {
  it("collapses a category that arrives twice, keeping one chip", async () => {
    // P5: delete the `equipment.some(...)` check in `push` — reddens at 2.
    queryProjectPrefill.mockResolvedValue({
      industry: null,
      categories: [category("flame-detectors"), category("flame-detectors")],
    });

    const prefill = await resolveRfqPrefill({ project: "dupe" }, "en", INDUSTRIES);

    expect(prefill?.equipment).toHaveLength(1);
  });

  it("does NOT collapse the same slug under a different kind", async () => {
    // A product and a category can legitimately share a slug; they are distinct
    // chips. P5: drop `existing.kind === kind` from the dedupe — reddens at 1.
    getProductBySlug.mockResolvedValue({
      slug: "gas-detection",
      name: "Gas detection",
      isFallback: false,
      category: category("gas-detection", "Gas detection"),
    });

    const prefill = await resolveRfqPrefill({ product: "gas-detection" }, "en", INDUSTRIES);

    expect(prefill?.equipment).toHaveLength(2);
    expect(prefill?.equipment.map((item) => item.kind)).toEqual(["product", "category"]);
  });
});

describe("`resolved` vs `params` — the attribution split (3.4 review)", () => {
  it("a slug that resolves to NO row is carried in params but NOT in resolved", async () => {
    // The review's headline: `prefillContext.resolved` was filled from `params`,
    // so a fabricated slug was recorded as though it had resolved. `POST
    // /api/rfq` derives `Lead.source` from `resolved`, so this is the gate.
    //
    // P5: assign `resolved.project = params.project` unconditionally — reddens.
    queryProjectPrefill.mockResolvedValue(null);

    const prefill = await resolveRfqPrefill({ project: "zzq-marker-7f3" }, "en", INDUSTRIES);

    expect(prefill).not.toBeNull();
    expect(prefill?.params.project).toBe("zzq-marker-7f3");
    expect(prefill?.resolved).toEqual({});
    // Nothing to show, so no banner — but the params survived for attribution.
    expect(prefill?.doorway).toBeNull();
  });

  it("records `industry` as resolved even when a project already won the select", async () => {
    // Both params resolved; the project supplies the SELECTED industry, but the
    // industry param still named a real row and `prefillContext` records what
    // resolved rather than what was displayed.
    queryProjectPrefill.mockResolvedValue({
      industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
      categories: [],
    });

    const prefill = await resolveRfqPrefill(
      { project: "lng", industry: "oil-gas" },
      "en",
      INDUSTRIES,
    );

    expect(prefill?.resolved).toEqual({ project: "lng", industry: "oil-gas" });
    expect(prefill?.doorway).toBe("project");
  });

  it("returns null ONLY for a cold visit — no params at all", async () => {
    // P5: restore the old `if (!doorway) return null` and this reddens, because
    // an unresolvable doorway would again reach the form as a cold visit and
    // persist as `direct`.
    expect(await resolveRfqPrefill({}, "en", INDUSTRIES)).toBeNull();
    expect(
      await resolveRfqPrefill({ industry: "no-such-sector" }, "en", INDUSTRIES),
    ).not.toBeNull();
  });
});

describe("the `q` doorway", () => {
  it("carries the query into resolved and onto the model, with no lookup", async () => {
    const prefill = await resolveRfqPrefill({ q: "fd9500x" }, "en", INDUSTRIES);

    expect(prefill?.query).toBe("fd9500x");
    expect(prefill?.resolved.q).toBe("fd9500x");
    expect(prefill?.doorway).toBe("search");
    expect(queryProjectPrefill).not.toHaveBeenCalled();
    expect(getProductBySlug).not.toHaveBeenCalled();
  });
});
