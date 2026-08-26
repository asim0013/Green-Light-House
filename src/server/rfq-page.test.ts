import { describe, it, expect, vi } from "vitest";

// Same stub as robots.test.ts — next-intl's navigation entry cannot resolve
// under vitest; @/lib/seo pulls it in transitively.
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    href === "/" ? `/${locale}` : `/${locale}${href}`,
}));

const { rfqSignals } = await import("./rfq-page");
const { isIndexable } = await import("@/lib/seo");
const { routing } = await import("@/i18n/routing");

describe("rfqSignals", () => {
  it("is indexable in ALL THREE locales — the Task 0 #9 decision, pinned", () => {
    // The page's robots tag AND the sitemap's three /rfq entries both rest on
    // this. If the signals ever start deriving from DB inputs (the industry
    // list is an INPUT, not content), this goes red and the decision resurfaces.
    for (const locale of routing.locales) {
      expect(isIndexable(rfqSignals(locale)), locale).toBe(true);
    }
  });
});
