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
    // This pins the PREDICATE only. The page-side wiring (that the rendered
    // /rfq actually declares index,follow) is a separate proof —
    // e2e/rfq.spec.ts's robots-meta test — because deleting the page's
    // `robots:` line would keep this test green (3.2 review). If the signals
    // ever start deriving from DB inputs (the industry list is an INPUT, not
    // content), this goes red and the decision resurfaces.
    for (const locale of routing.locales) {
      expect(isIndexable(rfqSignals(locale)), locale).toBe(true);
    }
  });
});
