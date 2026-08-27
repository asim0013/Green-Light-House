import { describe, it, expect } from "vitest";
import {
  PREFILL_PARAMS,
  SLUG_PREFILL_PARAMS,
  PREFILL_PRECEDENCE,
  prefillSlugOf,
  parseLeadEquipment,
  isLeadEquipmentItem,
  parsePrefillContext,
  isEmptyPrefillContext,
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

  it("resolves source most-specific-first, and deliberately omits `category`", () => {
    expect([...PREFILL_PRECEDENCE]).toEqual(["project", "product", "industry", "q"]);
    // `category` is an accepted, slug-gated param that is NOT a source origin: it
    // is equipment context, carried by `LeadEquipmentItem { kind: "category" }`
    // and preserved in `prefillContext`. Asserted explicitly because the Story 3.0
    // code review filed the omission as a defect — four lenses read it as an
    // oversight, since nothing said otherwise.
    expect(PREFILL_PARAMS).toContain("category");
    expect(PREFILL_PRECEDENCE).not.toContain("category");
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

  /**
   * ⚠️ These three were MISSING (Story 3.0 code review): deleting the `slug` check
   * or the `text` check from the guard left all ten assertions in this block
   * green, so two of the three fields the contract exists to guarantee were
   * unguarded by any test.
   */
  it("requires a slug on resolved items", () => {
    expect(isLeadEquipmentItem({ kind: "product", label: "FD-9500" })).toBe(false);
    expect(isLeadEquipmentItem({ kind: "category", label: "PPE" })).toBe(false);
  });

  it("requires text on a freeText item", () => {
    expect(isLeadEquipmentItem({ kind: "freeText" })).toBe(false);
    expect(isLeadEquipmentItem({ kind: "freeText", label: "not text" })).toBe(false);
  });

  it("slug-gates the slug rather than merely type-checking it", () => {
    // The module imports `isValidSlug` and applies it in `prefillSlugOf`; this
    // guard used to accept "" and "Oil Gas/../x" for the same field.
    for (const slug of ["", "  ", "Oil-Gas", "oil gas", "../../admin", "a".repeat(65)]) {
      expect(isLeadEquipmentItem({ kind: "product", slug, label: "x" }), slug).toBe(false);
    }
    expect(isLeadEquipmentItem({ kind: "product", slug: "fd-9500", label: "x" })).toBe(true);
  });

  it("rejects empty label and empty text — a blank chip is not something a buyer typed", () => {
    expect(isLeadEquipmentItem({ kind: "product", slug: "fd-9500", label: "" })).toBe(false);
    expect(isLeadEquipmentItem({ kind: "freeText", text: "   " })).toBe(false);
  });

  it("never throws on hostile JSONB, including values that break unguarded `.length`", () => {
    const hostile = [
      { kind: "product", slug: null, label: "x" },
      { kind: "product", slug: 42, label: "x" },
      { kind: "freeText", text: null },
      ["kind", "product"],
      null,
      Object.create(null),
    ];
    expect(() => parseLeadEquipment(hostile)).not.toThrow();
    expect(parseLeadEquipment(hostile)).toEqual([]);
  });

  it("drops malformed entries instead of throwing on arbitrary JSONB", () => {
    expect(() => parseLeadEquipment("not an array")).not.toThrow();
    expect(parseLeadEquipment("not an array")).toEqual([]);
    expect(parseLeadEquipment([null, 1, { kind: "product", slug: "a", label: "A" }])).toEqual([
      { kind: "product", slug: "a", label: "A" },
    ]);
  });
});

describe("prefillContext — the shape Story 4.7 reads back (3.4)", () => {
  /**
   * Story 3.0 froze the COLUMN (`Lead.prefillContext Json @default("{}")`) but
   * not the JSON inside it. A shape minted ad hoc at the call site becomes the
   * de facto spec and this module becomes a comment — the exact failure the
   * frozen contracts exist to prevent. So it is frozen here, next to
   * `LeadEquipmentItem`, with the same never-throws parse discipline.
   */
  it("carries SLUGS, never ids — a lead must survive its rows being renamed", () => {
    const context = parsePrefillContext({
      resolved: { project: "lng-terminal-fire-gas-upgrade", industry: "oil-gas" },
      cleared: false,
      edited: true,
    });
    expect(context.resolved.project).toBe("lng-terminal-fire-gas-upgrade");
    expect(context.resolved.industry).toBe("oil-gas");
    expect(context.edited).toBe(true);
    expect(context.cleared).toBe(false);
  });

  it("keeps the sanitized query separately — `q` is buyer text, not a slug", () => {
    const context = parsePrefillContext({
      resolved: {},
      query: "fd9500x",
      cleared: false,
      edited: false,
    });
    expect(context.query).toBe("fd9500x");
    // …and it is NOT slug-gated, unlike everything in `resolved`.
    expect(
      parsePrefillContext({ resolved: {}, query: "FD 9500/X", cleared: false, edited: false })
        .query,
    ).toBe("FD 9500/X");
  });

  it("DROPS a resolved value that is not a valid slug — the anti-spoofing rule", () => {
    // The whole point of resolving server-side is that no URL-supplied label can
    // reach Story 4.7's admin. A non-slug here means something bypassed the gate.
    const context = parsePrefillContext({
      resolved: { project: "Oil Gas/../x", industry: "oil-gas" },
      cleared: false,
      edited: false,
    });
    expect(context.resolved.project).toBeUndefined();
    expect(context.resolved.industry).toBe("oil-gas");
  });

  it("NEVER THROWS on arbitrary JSONB, and degrades to the empty context", () => {
    for (const hostile of [
      null,
      "not an object",
      42,
      [],
      { resolved: "nope" },
      Object.create(null),
    ]) {
      expect(() => parsePrefillContext(hostile)).not.toThrow();
    }
    expect(parsePrefillContext(null)).toEqual({ resolved: {}, cleared: false, edited: false });
    expect(parsePrefillContext({ resolved: { bogusParam: "x" } }).resolved).toEqual({});
  });

  it("is EMPTY for a cold visit — the DB default must parse to the same thing", () => {
    expect(parsePrefillContext({})).toEqual({ resolved: {}, cleared: false, edited: false });
    expect(isEmptyPrefillContext(parsePrefillContext({}))).toBe(true);
    expect(isEmptyPrefillContext(parsePrefillContext({ resolved: { industry: "oil-gas" } }))).toBe(
      false,
    );
  });
});
