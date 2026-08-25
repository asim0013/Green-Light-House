import { describe, it, expect } from "vitest";
import {
  PREFILL_PARAMS,
  SLUG_PREFILL_PARAMS,
  PREFILL_PRECEDENCE,
  prefillSlugOf,
  parseLeadEquipment,
  isLeadEquipmentItem,
} from "./contracts";

/**
 * The frozen Epic 3 contracts (Story 3.0, AC3 + AC4).
 *
 * These tests exist to make the contracts UNCHANGEABLE BY ACCIDENT. Story 2.5
 * minted `/rfq?q=` unilaterally and pinned it in shipped code before Story 3.4,
 * which owns pre-fill, had a say — the cost of an unfrozen contract is that the
 * first story to touch it wins. So the vocabulary itself is asserted, not just
 * the behaviour of the helpers.
 */

describe("the pre-fill vocabulary is frozen", () => {
  it("is exactly these five params — adding one is a cross-story decision", () => {
    expect([...PREFILL_PARAMS]).toEqual(["project", "product", "industry", "category", "q"]);
  });

  it("keeps `q`, which Story 2.5 already shipped and two e2e specs pin", () => {
    expect(PREFILL_PARAMS).toContain("q");
  });

  it("slug-gates everything except `q` — `q` is free buyer text", () => {
    expect([...SLUG_PREFILL_PARAMS]).toEqual(["project", "product", "industry", "category"]);
    expect(SLUG_PREFILL_PARAMS).not.toContain("q");
  });

  it("resolves source most-specific-first", () => {
    expect([...PREFILL_PRECEDENCE]).toEqual(["project", "product", "industry", "q"]);
  });
});

describe("prefillSlugOf", () => {
  it("accepts a well-formed slug", () => {
    expect(prefillSlugOf("fd-9500")).toBe("fd-9500");
  });

  it("takes the FIRST value on a repeated param — repeatable params are rejected", () => {
    expect(prefillSlugOf(["oil-gas", "energy"])).toBe("oil-gas");
  });

  it.each([
    ["uppercase", "Oil-Gas"],
    ["a space", "oil gas"],
    ["a slash", "oil/gas"],
    ["a leading hyphen", "-oil"],
    ["empty", ""],
    ["over 64 chars", "a".repeat(65)],
  ])("returns null for %s rather than passing it to a query or cache key", (_l, value) => {
    expect(prefillSlugOf(value)).toBeNull();
  });

  it("returns null for absent input", () => {
    expect(prefillSlugOf(undefined)).toBeNull();
    expect(prefillSlugOf([])).toBeNull();
  });

  it("passes through an unknown-but-well-formed slug — existence is the caller's lookup", () => {
    expect(prefillSlugOf("no-such-product")).toBe("no-such-product");
  });
});

describe("Lead.equipment is a tagged union", () => {
  it("discriminates on an explicit `kind`, never on the presence of a field", () => {
    // The whole point: a freeText item that happens to gain a field must not
    // start reading as a product.
    expect(isLeadEquipmentItem({ kind: "freeText", text: "FM-200 skid", slug: "x" })).toBe(true);
    expect(parseLeadEquipment([{ kind: "freeText", text: "FM-200 skid", slug: "x" }])).toEqual([
      { kind: "freeText", text: "FM-200 skid", slug: "x" },
    ]);
  });

  it("rejects an item with a slug and label but NO kind", () => {
    expect(isLeadEquipmentItem({ slug: "fd-9500", label: "Flame detector" })).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(isLeadEquipmentItem({ kind: "sku", slug: "a", label: "b" })).toBe(false);
  });

  it("accepts the three legitimate kinds", () => {
    expect(isLeadEquipmentItem({ kind: "product", slug: "fd-9500", label: "FD-9500" })).toBe(true);
    expect(isLeadEquipmentItem({ kind: "category", slug: "ppe", label: "PPE" })).toBe(true);
    expect(isLeadEquipmentItem({ kind: "freeText", text: "something odd" })).toBe(true);
  });

  it("requires the label snapshot on resolved items — the admin reads it later", () => {
    expect(isLeadEquipmentItem({ kind: "product", slug: "fd-9500" })).toBe(false);
  });

  it("drops malformed entries instead of throwing on arbitrary JSONB", () => {
    expect(() => parseLeadEquipment("not an array")).not.toThrow();
    expect(parseLeadEquipment("not an array")).toEqual([]);
    expect(parseLeadEquipment([null, 1, { kind: "product", slug: "a", label: "A" }])).toEqual([
      { kind: "product", slug: "a", label: "A" },
    ]);
  });
});
