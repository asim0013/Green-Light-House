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

  it("names the extension Story 3.5 added for the site-wide response process", () => {
    expect(TAGS.sla).toBe("sla");
    // Its own tag, not `catalog`: the SLA is read by EIGHT page types that cut
    // across the catalogue and everything else, so folding it into a catalogue
    // flush would make a one-line copy edit invalidate the whole catalogue — and
    // a catalogue publish needlessly re-render the SLA. (Still NOT "every route":
    // the legal pages render none. ⚠️ But /contact DOES since Story 3.8 — an
    // earlier version of this comment named it as an example of a page that does
    // not, which stopped being true the moment that page mounted `RfqForm`.)
    //
    // ⚠️ `expect(TAGS.sla).not.toBe(TAGS.catalog)` USED TO SIT HERE AND COULD NOT
    // FAIL — the line above already pins the value to "sla", so the inequality
    // was arithmetic, not a test. What actually has to hold is that the
    // revalidate endpoint ACCEPTS this tag: it refuses anything `isKnownTag`
    // rejects with a 422, so a tag registered in the map but missing from the
    // known set would make every SLA publish a silent no-op.
    expect(isKnownTag(TAGS.sla)).toBe(true);
  });

  it("lists every collection tag in ALL_COLLECTION_TAGS", () => {
    // ⚠️ A DELIBERATELY CLOSED SET. Every story that mints a tag must come here
    // and say so — that is the whole point, and it is why adding `sla` (Story
    // 3.5) turned this red rather than passing silently. An open-ended assertion
    // would let a typo'd tag join the map unnoticed, and a mistyped tag makes
    // `revalidateTag` a no-op: the admin's edit never goes live and the symptom
    // reads as ordinary staleness.
    expect([...ALL_COLLECTION_TAGS].sort()).toEqual(
      [
        "catalog",
        "categories",
        "documents",
        "industries",
        "manufacturers",
        "projects",
        "services",
        "sla",
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
