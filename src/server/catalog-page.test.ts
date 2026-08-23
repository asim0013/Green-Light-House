// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * Same resolution problem as `industry-page.test.ts`: the module reaches
 * `@/lib/seo` → next-intl's `createNavigation` → `next/navigation`, which does
 * not resolve under Vitest. Faithful stub per the established convention; the
 * REAL `getPathname` is covered by the e2e canonical assertions.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

import {
  isValidSlug,
  categoryParamOf,
  catalogSignals,
  flattenTree,
  searchQueryOf,
  filterSlugOf,
  SEARCH_QUERY_MAX_LENGTH,
} from "./catalog-page";
import { isIndexable, thinContentReason } from "@/lib/seo";
import type { CategoryTreeNode } from "@/server/repositories/category";

/**
 * The `/products` slug gate + thin-content signals (Story 2.2).
 *
 * The gate is the closure of a named 2.1-review defer: the `?category` value is
 * attacker-controlled, and 2.1 measured both the unbounded-cache-entry exposure
 * and the >247-char tag log-amplification an unvalidated value feeds. Nothing
 * malformed may reach a query OR a cache key.
 */

describe("isValidSlug", () => {
  it("accepts every seeded slug shape", () => {
    for (const slug of [
      "ex-proof",
      "fire-gas-detection",
      "fixed-suppression",
      "ppe",
      "flame-detectors",
    ]) {
      expect(isValidSlug(slug), slug).toBe(true);
    }
  });

  it("rejects the shapes the 2.1 review measured as exposures", () => {
    expect(isValidSlug("a".repeat(65))).toBe(false); // length gate (tag log-amp at >247)
    expect(isValidSlug("UPPER")).toBe(false); // case rule: stored slugs are lowercase
    expect(isValidSlug("a b")).toBe(false);
    expect(isValidSlug("a&b")).toBe(false); // the sitemap-XML-hostile class
    expect(isValidSlug("нефть")).toBe(false); // non-ASCII
    expect(isValidSlug("-leading")).toBe(false);
    expect(isValidSlug("trailing-")).toBe(false);
    expect(isValidSlug("double--hyphen")).toBe(false);
    expect(isValidSlug("")).toBe(false);
    expect(isValidSlug("../etc")).toBe(false);
  });

  it("accepts the boundary length exactly", () => {
    expect(isValidSlug("a".repeat(64))).toBe(true);
  });
});

describe("categoryParamOf", () => {
  it("passes a valid single value through", () => {
    expect(categoryParamOf("ppe")).toBe("ppe");
  });

  it("takes the FIRST value of a repeated param (Task 0 decision)", () => {
    expect(categoryParamOf(["ppe", "ex-proof"])).toBe("ppe");
  });

  it("returns null for absent, empty, and malformed values", () => {
    expect(categoryParamOf(undefined)).toBeNull();
    expect(categoryParamOf("")).toBeNull();
    expect(categoryParamOf([])).toBeNull();
    expect(categoryParamOf("A&B")).toBeNull();
  });
});

const node = (
  slug: string,
  publishedCount = 0,
  children: CategoryTreeNode[] = [],
  isFallback = false,
): CategoryTreeNode => ({ id: slug, slug, name: slug, isFallback, publishedCount, children });

describe("catalogSignals", () => {
  it("counts PUBLISHED PRODUCTS as content — a structure-only deploy is thin", () => {
    // Categories exist but hold nothing: itemCount 0 ⇒ empty ⇒ noindex (FR42a).
    const signals = catalogSignals("en", [node("a"), node("b")]);
    expect(signals.itemCount).toBe(0);
    expect(thinContentReason(signals)).toBe("empty");
    expect(isIndexable(signals)).toBe(false);
  });

  it("sums counts across the WHOLE tree, children included", () => {
    // The measured seed: 3 direct at root levels + 2 in the child = 5.
    const signals = catalogSignals("en", [
      node("ex-proof", 1),
      node("fire-gas-detection", 1, [node("flame-detectors", 2)]),
      node("fixed-suppression", 0),
      node("ppe", 1),
    ]);
    expect(signals.itemCount).toBe(5);
    expect(isIndexable(signals)).toBe(true);
  });

  it("is VIEW-INDEPENDENT by construction — it takes only the tree", () => {
    // The property the mixed-signal defect class hinges on: identical input ⇒
    // identical verdict, whatever ?category the request carried.
    const tree = [node("a", 1)];
    expect(catalogSignals("en", tree)).toEqual(catalogSignals("en", tree));
  });

  it("is fallback-only when every category name fell back", () => {
    const signals = catalogSignals("ru", [node("a", 2, [], true), node("b", 1, [], true)]);
    expect(signals.fallbackFields).toBe(2);
    expect(signals.totalFields).toBe(2);
    expect(thinContentReason(signals)).toBe("fallback-only");
  });

  it("EN is never fallback-only — it is the source language", () => {
    expect(isIndexable(catalogSignals("en", [node("a", 1, [], true)]))).toBe(true);
  });
});

describe("flattenTree", () => {
  it("flattens depth-first, depth-agnostic", () => {
    const tree = [node("a", 0, [node("b", 0, [node("c")])]), node("d")];
    expect(flattenTree(tree).map((n) => n.slug)).toEqual(["a", "b", "c", "d"]);
  });

  it("returns empty for an empty forest", () => {
    expect(flattenTree([])).toEqual([]);
  });
});

describe("searchQueryOf", () => {
  it("trims and passes free text through — charset is NOT the gate here", () => {
    expect(searchQueryOf("  FD-9500  ")).toBe("FD-9500");
    expect(searchQueryOf("Üç-IR alev")).toBe("Üç-IR alev");
  });

  it("caps at SEARCH_QUERY_MAX_LENGTH — the value reaches SQL and the page echo", () => {
    const long = "x".repeat(500);
    expect(searchQueryOf(long)).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
  });

  it("first value wins on repeated params; blank collapses to null", () => {
    expect(searchQueryOf(["fd-9500", "gd-410"])).toBe("fd-9500");
    expect(searchQueryOf("   ")).toBeNull();
    expect(searchQueryOf(undefined)).toBeNull();
    expect(searchQueryOf("")).toBeNull();
  });
});

describe("filterSlugOf", () => {
  it("accepts well-formed slugs, rejects everything else — the categoryParamOf rule", () => {
    expect(filterSlugOf("sentra-fire")).toBe("sentra-fire");
    expect(filterSlugOf("Sentra")).toBeNull();
    expect(filterSlugOf("a&b")).toBeNull();
    expect(filterSlugOf("x".repeat(65))).toBeNull();
    expect(filterSlugOf(["gastec", "exlume"])).toBe("gastec");
    expect(filterSlugOf(undefined)).toBeNull();
  });
});

describe("searchQueryOf hardening (2.5 review)", () => {
  it("strips control characters — a NUL byte was a plain HTTP 500", () => {
    expect(searchQueryOf("fd\u00009500")).toBe("fd 9500");
    // A query that is ONLY control characters is not a query.
    expect(searchQueryOf("\u0000")).toBeNull();
    expect(searchQueryOf("\u0000\u0007")).toBeNull();
  });

  it("caps by CODE POINT so an emoji is never split into a lone surrogate", () => {
    const q = "a".repeat(79) + "\u{1F525}";
    const out = searchQueryOf(q);
    // 80 code points, and the last one is the INTACT emoji.
    expect([...out!]).toHaveLength(SEARCH_QUERY_MAX_LENGTH);
    expect(out!.endsWith("\u{1F525}")).toBe(true);
    // No lone surrogate survived.
    expect(/[\uD800-\uDFFF]/.test(out!.replace(/[\u{10000}-\u{10FFFF}]/gu, ""))).toBe(false);
  });

  it("rejects queries below the minimum length — the broadest, least indexable shape", () => {
    expect(searchQueryOf("a")).toBeNull();
    expect(searchQueryOf("ab")).toBeNull();
    expect(searchQueryOf("abc")).toBe("abc");
  });
});
