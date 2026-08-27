import { describe, it, expect } from "vitest";
import { distinctCategories } from "@/server/repositories/project";
import { resolvePrefillSource, readPrefillParams, buildPrefillContext } from "./prefill";

/**
 * The doorway resolver (Story 3.4, AC1–AC6, AC9).
 *
 * PURE FUNCTIONS ONLY IN THIS FILE — no Prisma, no queue, no network. vitest
 * loads `.env`, so a test that reached the repositories would hit the developer's
 * live database. The Prisma projections are proven in the integration suite; what
 * is proven HERE is every decision that can be wrong without a database:
 * precedence, gating, de-duplication, ordering and the anti-spoofing rule.
 */

describe("resolvePrefillSource — walking the frozen precedence (AC9)", () => {
  it("takes the FIRST present param, most specific wins", () => {
    // The admin needs to know a lead came from a product page even when the URL
    // also carried its industry.
    expect(resolvePrefillSource({ project: "p", product: "x", industry: "i", q: "text" })).toBe(
      "project",
    );
    expect(resolvePrefillSource({ product: "x", industry: "i", q: "text" })).toBe("product");
    expect(resolvePrefillSource({ industry: "i", q: "text" })).toBe("industry");
  });

  it("`q` maps to `search`", () => {
    expect(resolvePrefillSource({ q: "fd9500x" })).toBe("search");
  });

  it("a CATEGORY-only doorway is `direct` — category is equipment context, not an origin", () => {
    // ⚠️ `category`'s absence from PREFILL_PRECEDENCE was mis-filed as a defect in
    // the Story 3.0 review precisely because nothing asserted it. This test is
    // what stops it being re-filed: `LeadSource` deliberately has no `category`
    // member, and the value is still preserved in prefillContext.
    expect(resolvePrefillSource({ category: "flame-detectors" })).toBe("direct");
  });

  it("no params at all is `direct`", () => {
    expect(resolvePrefillSource({})).toBe("direct");
  });

  it("never yields `service` — it is a RESERVED origin with no param that transmits it", () => {
    // contracts.ts hands 3.4 the decision and 3.4 declined: the services CTA
    // ships context-free, so nothing in the frozen vocabulary can write this.
    const everyParam = { project: "p", product: "x", industry: "i", category: "c", q: "t" };
    expect(resolvePrefillSource(everyParam)).not.toBe("service");
  });
});

describe("readPrefillParams — the gates, applied at the route (AC6)", () => {
  it("accepts well-formed slugs and REJECTS malformed ones", () => {
    expect(readPrefillParams({ project: "lng-terminal-fire-gas-upgrade" }).project).toBe(
      "lng-terminal-fire-gas-upgrade",
    );
    for (const bad of ["Oil Gas", "../etc", "-leading", "UPPER", "a".repeat(65), ""]) {
      expect(readPrefillParams({ project: bad }).project, `must reject ${bad}`).toBeUndefined();
    }
  });

  it("takes the FIRST of a repeated param — repeatable params are refused, not merged", () => {
    expect(readPrefillParams({ product: ["fd-9500", "fd-9300"] }).product).toBe("fd-9500");
  });

  it("sanitizes `q` rather than rejecting it — it is buyer text, not a slug", () => {
    expect(readPrefillParams({ q: "FD 9500/X" }).q).toBe("FD 9500/X");
  });

  it("REJECTS a `q` carrying bidi overrides, which the write boundary would 422", () => {
    // ⚠️ `searchQueryOf` strips C0/C1 but PASSES bidi overrides, while the RFQ's
    // own schema REJECTS them. Without this second gate the site would pre-fill a
    // value it then refuses to accept, and scramble the banner's text direction.
    const bidi = `model${String.fromCharCode(0x202e)}9500`;
    expect(readPrefillParams({ q: bidi }).q).toBeUndefined();
  });

  it("drops a `q` below the minimum length — the same gate the catalogue uses", () => {
    expect(readPrefillParams({ q: "ab" }).q).toBeUndefined();
  });

  it("drops a NUL byte rather than 500ing on it", () => {
    const withNul = `fd${String.fromCharCode(0)}9500`;
    expect(() => readPrefillParams({ q: withNul })).not.toThrow();
    // C0 becomes a space, so what survives is the cleaned value.
    expect(readPrefillParams({ q: withNul }).q).toBe("fd 9500");
  });
});

describe("distinctCategories — de-duplication and order (AC1)", () => {
  const cat = (slug: string, name?: string) => ({
    id: slug,
    slug,
    translations: name ? [{ locale: "en" as const, name }] : [],
  });

  it("DE-DUPLICATES by slug — two products in one category yield ONE chip", () => {
    // Unprovable through the seed: LNG's two products are already in two
    // different categories, so removing the dedupe changes nothing observable
    // there. That is why this is a pure function with its own test.
    const rows = [
      cat("flame-detectors", "Flame detectors"),
      cat("flame-detectors", "Flame detectors"),
    ];
    expect(distinctCategories(rows, "en")).toHaveLength(1);
  });

  it("keeps a PARENT and its own CHILD — never rolls up", () => {
    const rows = [
      cat("flame-detectors", "Flame detectors"),
      cat("fire-gas-detection", "Fire & gas"),
    ];
    expect(distinctCategories(rows, "en").map((c) => c.slug)).toEqual([
      "fire-gas-detection",
      "flame-detectors",
    ]);
  });

  it("orders by SLUG, not by the join's arbitrary cuid order", () => {
    const rows = [cat("zeta"), cat("alpha"), cat("mid")];
    expect(distinctCategories(rows, "en").map((c) => c.slug)).toEqual(["alpha", "mid", "zeta"]);
  });

  it("skips an uncategorised product rather than emitting an empty chip", () => {
    expect(distinctCategories([null, cat("alpha", "Alpha")], "en")).toHaveLength(1);
  });

  it("marks a fallback name, and degrades a translation-less row to its slug", () => {
    const [fallback] = distinctCategories([cat("alpha", "Alpha")], "tr");
    expect(fallback.name).toBe("Alpha");
    expect(fallback.isFallback).toBe(true);

    // ⚠️ DISCLOSED PRE-EXISTING BEHAVIOUR: a row with NO translations at all
    // degrades to its raw slug and reports isFallback FALSE, so it would sit
    // unmarked inside a Turkish banner. Fixing the degradation contract is a
    // cross-surface change, not 3.4's — but it is asserted so it cannot drift
    // silently.
    const [none] = distinctCategories([cat("alpha")], "tr");
    expect(none.name).toBe("alpha");
    expect(none.isFallback).toBe(false);
  });
});

describe("buildPrefillContext — what Story 4.7 reads back (AC9)", () => {
  it("records the resolved slugs, never a label from the URL", () => {
    const context = buildPrefillContext(
      { project: "lng-terminal-fire-gas-upgrade", industry: "oil-gas" },
      { cleared: false, edited: false },
    );
    expect(context.resolved).toEqual({
      project: "lng-terminal-fire-gas-upgrade",
      industry: "oil-gas",
    });
  });

  it("carries the sanitized query separately from the slugs", () => {
    const context = buildPrefillContext({ q: "fd9500x" }, { cleared: false, edited: false });
    expect(context.query).toBe("fd9500x");
    expect(context.resolved).toEqual({});
  });

  it("records cleared and edited independently", () => {
    expect(buildPrefillContext({}, { cleared: true, edited: false }).cleared).toBe(true);
    expect(buildPrefillContext({}, { cleared: false, edited: true }).edited).toBe(true);
  });
});
