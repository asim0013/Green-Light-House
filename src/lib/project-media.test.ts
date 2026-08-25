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

  it("keys the URL on the media id, not the storage key", () => {
    // The storage key changes when Epic 4 replaces the file; the URL must not.
    expect(projectMediaHref("lng", "hero")).not.toContain("projects/lng/hero.jpg");
  });
});
