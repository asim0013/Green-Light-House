// @vitest-environment node
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NAV_ITEMS, FOOTER_CONTACT, FOOTER_LEGAL, SITE } from "./site";

/**
 * Every link the site chrome renders on EVERY page must have a page behind it.
 * `/about` sat in the primary nav as a 404 from Story 1.6 until the launch prep
 * removed it (and in production its prefetch never settled) — nothing failed,
 * because every nav assertion checked links by name, never by destination.
 */
const PUBLIC = join(process.cwd(), "src", "app", "[locale]", "(public)");

const hasPage = (href: string) =>
  existsSync(join(PUBLIC, ...href.split("/").filter(Boolean), "page.tsx"));

describe("chrome links resolve to real pages", () => {
  it("the probe itself works (a known page exists, a made-up one does not)", () => {
    expect(hasPage("/products")).toBe(true);
    expect(hasPage("/about")).toBe(false);
  });

  for (const { key, href } of [...NAV_ITEMS, ...FOOTER_CONTACT, ...FOOTER_LEGAL]) {
    it(`${key} → ${href}`, () => {
      expect(hasPage(href), `${href} is linked from the site chrome but has no page.tsx`).toBe(
        true,
      );
    });
  }

  it(`the RFQ CTA → ${SITE.rfqHref}`, () => {
    expect(hasPage(SITE.rfqHref)).toBe(true);
  });
});
