import { describe, it, expect } from "vitest";
import {
  parseProjectMedia,
  isProjectMediaEntry,
  projectMediaHref,
  SAFE_IMAGE_MIME,
} from "./project-media";

/**
 * The frozen `Project.media` contract (Story 3.0, AC8).
 *
 * These are the assertions Story 3.1 will build its image band on. The two that
 * are genuinely load-bearing rather than shape-checking:
 *
 *   - SVG must be rejected AT PARSE, because delivery is same-origin and an SVG
 *     is a script-carrying document. If this test goes green with SVG allowed,
 *     the project has stored XSS the moment Epic 4 accepts uploads.
 *   - A malformed blob must degrade to "no photos", never throw — a public page
 *     must not 500 because someone hand-edited a JSONB column.
 */

const entry = (over: Record<string, unknown> = {}) => ({
  id: "hero",
  storageKey: "projects/lng/hero.jpg",
  mime: "image/jpeg",
  alt: { en: "Gas detection skid on the jetty" },
  sort: 0,
  ...over,
});

describe("parseProjectMedia — the security boundary", () => {
  it("REJECTS image/svg+xml: same-origin delivery makes it a script vector", () => {
    expect(isProjectMediaEntry(entry({ mime: "image/svg+xml" }))).toBe(false);
    expect(parseProjectMedia([entry({ mime: "image/svg+xml" })])).toEqual([]);
  });

  it("does not list svg among the safe types", () => {
    expect(SAFE_IMAGE_MIME).not.toContain("image/svg+xml");
  });

  it("accepts exactly the four allowlisted raster types and nothing else", () => {
    // ⚠️ THE CARDINALITY + IDENTITY ASSERTIONS ARE THE POINT (Story 3.0 code
    // review). Without them the loop below is true BY CONSTRUCTION for any list —
    // `isSafeMime` accepts precisely by `SAFE_IMAGE_MIME.includes()`, so iterating
    // the allowlist and asserting the guard accepts each member proves nothing
    // about WHICH types are allowed. Adding "image/svg+xml" to the list would have
    // left the old version of this test green.
    expect([...SAFE_IMAGE_MIME]).toEqual(["image/jpeg", "image/png", "image/webp", "image/avif"]);

    for (const mime of SAFE_IMAGE_MIME) {
      expect(isProjectMediaEntry(entry({ mime })), mime).toBe(true);
    }
    for (const mime of ["text/html", "application/pdf", "image/gif", ""]) {
      expect(isProjectMediaEntry(entry({ mime })), mime).toBe(false);
    }
  });
});

describe("parseProjectMedia — degradation", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a string", "not-an-array"],
    ["an object", { id: "hero" }],
    ["a number", 42],
  ])("returns [] for %s rather than throwing", (_label, value) => {
    expect(() => parseProjectMedia(value)).not.toThrow();
    expect(parseProjectMedia(value)).toEqual([]);
  });

  it("drops only the malformed entries, keeping the good ones", () => {
    const parsed = parseProjectMedia([
      entry({ id: "a", sort: 1 }),
      { id: "broken" },
      entry({ id: "b", sort: 0 }),
    ]);
    expect(parsed.map((m) => m.id)).toEqual(["b", "a"]);
  });

  it("requires EN alt — it is the fallback source every other locale resolves to", () => {
    expect(isProjectMediaEntry(entry({ alt: { tr: "Turkish only" } }))).toBe(false);
    expect(isProjectMediaEntry(entry({ alt: {} }))).toBe(false);
  });

  it("rejects a non-string value on ANY locale key, not just `en`", () => {
    // The narrowed type promises `tr?: string; ru?: string` and Story 3.1 renders
    // `alt[locale]` trusting it. `{ en: "ok", tr: 42 }` used to pass.
    expect(isProjectMediaEntry(entry({ alt: { en: "ok", tr: 42 } }))).toBe(false);
    expect(isProjectMediaEntry(entry({ alt: { en: "ok", ru: null } }))).toBe(false);
    expect(isProjectMediaEntry(entry({ alt: { en: "ok", tr: "tamam" } }))).toBe(true);
  });

  it("NEVER THROWS on a hostile entry INSIDE the array — the case the table above cannot reach", () => {
    // Every case in the degradation table is a non-array, so all five short-circuit
    // at `if (!Array.isArray(value)) return []` before any entry is inspected. The
    // `alt === null` guard — the one whose removal turns a malformed blob into a
    // 500 on a public project page, which is the stated reason this function
    // exists — was therefore never exercised (Story 3.0 code review).
    const hostile = [
      null,
      undefined,
      42,
      "string",
      [],
      entry({ alt: null }),
      entry({ alt: "not an object" }),
      entry({ alt: [] }),
      entry({ sort: Number.NaN }),
      entry({ sort: Number.POSITIVE_INFINITY }),
      entry({ id: "" }),
      entry({ storageKey: "" }),
      Object.create(null),
      new Date(),
    ];
    expect(() => parseProjectMedia(hostile)).not.toThrow();
    expect(parseProjectMedia(hostile)).toEqual([]);
  });

  it("rejects dot-segment and non-slug ids — they would escape the delivery route", () => {
    // `encodeURIComponent` does not escape `.`, so ".." survived encoding and the
    // browser normalized it away before the request left, resolving elsewhere.
    for (const id of ["..", ".", "a/b", "Hero", "hero image", "-hero", ""]) {
      expect(isProjectMediaEntry(entry({ id })), id).toBe(false);
    }
    expect(isProjectMediaEntry(entry({ id: "hero-2" }))).toBe(true);
  });

  it("drops duplicate ids — two entries must never share a delivery URL", () => {
    const parsed = parseProjectMedia([
      entry({ id: "hero", sort: 0, storageKey: "first.jpg" }),
      entry({ id: "hero", sort: 1, storageKey: "second.jpg" }),
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.storageKey).toBe("first.jpg");
  });
});

describe("parseProjectMedia — ordering", () => {
  it("sorts by sort ascending", () => {
    const parsed = parseProjectMedia([
      entry({ id: "c", sort: 2 }),
      entry({ id: "a", sort: 0 }),
      entry({ id: "b", sort: 1 }),
    ]);
    expect(parsed.map((m) => m.id)).toEqual(["a", "b", "c"]);
  });

  it("breaks ties by id so the order is TOTAL — storage must never pick", () => {
    const parsed = parseProjectMedia([
      entry({ id: "zebra", sort: 0 }),
      entry({ id: "alpha", sort: 0 }),
    ]);
    expect(parsed.map((m) => m.id)).toEqual(["alpha", "zebra"]);
  });
});

describe("projectMediaHref", () => {
  it("encodes both segments — a slug or id reaching a URL is never trusted raw", () => {
    expect(projectMediaHref("lng terminal", "a/b")).toBe(
      "/api/projects/lng%20terminal/media/a%2Fb",
    );
  });

  /**
   * ⚠️ REPLACES A TEST THAT COULD NOT FAIL (Story 3.0 code review).
   *
   * The original asserted the output did not contain a storage-key string that
   * was never passed in — and `projectMediaHref(projectSlug, mediaId)` has no
   * storage-key parameter, so no implementation of that signature could have
   * failed it. What the property actually needs is that the URL is stable across
   * a storage-key change, which is testable by parsing a real entry.
   */
  it("produces a URL that survives the storage key changing under it", () => {
    const before = parseProjectMedia([entry({ id: "hero", storageKey: "projects/lng/v1.jpg" })]);
    const after = parseProjectMedia([
      entry({ id: "hero", storageKey: "projects/lng/v2-other.jpg" }),
    ]);
    const hrefBefore = projectMediaHref("lng", before[0]!.id);
    const hrefAfter = projectMediaHref("lng", after[0]!.id);

    expect(hrefBefore).toBe(hrefAfter);
    expect(hrefBefore).toBe("/api/projects/lng/media/hero");
    // And the key genuinely differed, so the equality above is not vacuous.
    expect(before[0]!.storageKey).not.toBe(after[0]!.storageKey);
  });
});
