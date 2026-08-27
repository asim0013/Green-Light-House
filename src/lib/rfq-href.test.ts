import { describe, it, expect } from "vitest";
import {
  rfqProjectHref,
  rfqProductHref,
  rfqIndustryHref,
  rfqCategoryHref,
} from "./rfq-href";

/**
 * The doorway href builders (Story 3.4), mirroring `catalog-href.test.ts`.
 *
 * These strings are pinned by e2e assertions on three separate surfaces, so the
 * cheapest place to catch a drift is here, where the failure names the builder
 * rather than the page.
 */

describe("doorway hrefs", () => {
  it("each builder emits exactly ONE param — repeatable params are refused, not merged", () => {
    expect(rfqProjectHref("lng-terminal-fire-gas-upgrade")).toBe(
      "/rfq?project=lng-terminal-fire-gas-upgrade",
    );
    expect(rfqProductHref("fd-9500")).toBe("/rfq?product=fd-9500");
    expect(rfqIndustryHref("oil-gas")).toBe("/rfq?industry=oil-gas");
    expect(rfqCategoryHref("flame-detectors")).toBe("/rfq?category=flame-detectors");
  });

  it("URL-ENCODES the slug", () => {
    // Slugs are gated to `[a-z0-9-]` before they are ever stored, so this is
    // belt-and-braces — but a builder that skips encoding is one schema change
    // away from emitting a broken URL, and the omission is invisible until then.
    expect(rfqProductHref("a b")).toBe("/rfq?product=a%20b");
    expect(rfqProjectHref("a&b=c")).toBe("/rfq?project=a%26b%3Dc");
  });

  it("carries no label — the banner resolves names server-side from the slug", () => {
    // A display name in the URL would defeat localization AND let a crafted link
    // put arbitrary text on the page.
    expect(rfqIndustryHref("oil-gas")).not.toContain("Oil");
  });
});
