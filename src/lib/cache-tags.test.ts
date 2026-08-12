import { describe, it, expect } from "vitest";
import { TAGS, ALL_COLLECTION_TAGS, isKnownTag } from "./cache-tags";

/**
 * Cache-tag helpers (Story 1.8).
 *
 * These assert EXACT strings on purpose. A typo in a tag does not throw, does not
 * fail typecheck, and does not fail any other test — it silently turns
 * `revalidateTag` into a no-op, so content never goes live and the failure looks
 * like "caching is a bit stale" rather than a bug. The literal strings are the
 * contract (architecture § Process, "Cache-tag convention"), so they are pinned.
 */

describe("collection tags", () => {
  it("match the architecture's convention exactly", () => {
    expect(TAGS.catalog).toBe("catalog");
    expect(TAGS.projects).toBe("projects");
  });

  it("names the extensions Story 1.8 added", () => {
    expect(TAGS.industries).toBe("industries");
    expect(TAGS.categories).toBe("categories");
    expect(TAGS.manufacturers).toBe("manufacturers");
  });

  it("names the extensions Story 2.1 added for the industry landing blocks", () => {
    expect(TAGS.services).toBe("services");
    expect(TAGS.documents).toBe("documents");
  });

  it("lists every collection tag in ALL_COLLECTION_TAGS", () => {
    expect([...ALL_COLLECTION_TAGS].sort()).toEqual(
      [
        "catalog",
        "categories",
        "documents",
        "industries",
        "manufacturers",
        "projects",
        "services",
      ].sort(),
    );
  });
});

describe("entity tags", () => {
  it("uses the entity:{id} colon form from the architecture", () => {
    expect(TAGS.product("abc123")).toBe("product:abc123");
    expect(TAGS.industry("oil-gas")).toBe("industry:oil-gas");
    expect(TAGS.manufacturer("m1")).toBe("manufacturer:m1");
    expect(TAGS.project("lng-terminal-fire-gas-upgrade")).toBe(
      "project:lng-terminal-fire-gas-upgrade",
    );
  });
});

describe("isKnownTag", () => {
  it("accepts every collection tag", () => {
    for (const tag of ALL_COLLECTION_TAGS) expect(isKnownTag(tag)).toBe(true);
  });

  it("accepts well-formed entity tags", () => {
    expect(isKnownTag("industry:oil-gas")).toBe(true);
    expect(isKnownTag("product:clx123abc")).toBe(true);
  });

  it("rejects unknown prefixes and bare junk", () => {
    // The revalidate route is a public endpoint; it must not accept arbitrary
    // strings just because they parse as `something:something`.
    expect(isKnownTag("user:1")).toBe(false);
    expect(isKnownTag("catalogue")).toBe(false);
    expect(isKnownTag("")).toBe(false);
    expect(isKnownTag("product:")).toBe(false);
    expect(isKnownTag("product")).toBe(false);
  });

  it("rejects separators and wildcards that could widen a revalidation", () => {
    expect(isKnownTag("industry:oil gas")).toBe(false);
    expect(isKnownTag("industry:*")).toBe(false);
    expect(isKnownTag("industry:a,b")).toBe(false);
    expect(isKnownTag("industry:../etc")).toBe(false);
  });
});
