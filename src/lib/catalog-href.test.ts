import { describe, it, expect } from "vitest";
import { catalogHref } from "./catalog-href";

/**
 * The shared view-URL composer (Story 2.5 review). It exists because two chip
 * surfaces disagreed: the facet chips carried the active search, Story 2.2's
 * CategoryChips silently dropped it. These tests pin COMPOSITION — the property
 * AC3 requires of all three facets.
 */
describe("catalogHref", () => {
  it("returns the clean path when nothing is active — the canonical stays bare", () => {
    expect(catalogHref({})).toBe("/products");
    expect(catalogHref({ q: null, categorySlug: null })).toBe("/products");
  });

  it("carries every active param together", () => {
    expect(
      catalogHref({
        q: "detector",
        categorySlug: "ppe",
        manufacturerSlug: "gastec",
        seriesSlug: "flameguard",
      }),
    ).toBe("/products?q=detector&category=ppe&manufacturer=gastec&series=flameguard");
  });

  it("adding a category PRESERVES an active search — the defect this fixes", () => {
    expect(catalogHref({ q: "detector", categorySlug: "flame-detectors" })).toBe(
      "/products?q=detector&category=flame-detectors",
    );
  });

  it("clearing one facet keeps the others", () => {
    expect(catalogHref({ q: "detector", manufacturerSlug: null, seriesSlug: "flameguard" })).toBe(
      "/products?q=detector&series=flameguard",
    );
  });

  it("URL-encodes the free-text query", () => {
    expect(catalogHref({ q: "fd 9500 & co" })).toBe("/products?q=fd+9500+%26+co");
  });
});
