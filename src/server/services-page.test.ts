// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * `services-page.ts` reaches `@/lib/seo` → `@/i18n/navigation` → next-intl's
 * `createNavigation`, which imports `next/navigation` and does not resolve under
 * Vitest. Stubbed with a faithful `getPathname`, the convention `industry-page`,
 * `product-page` and `HomeHero` already use. The REAL `getPathname` is covered
 * end-to-end by the canonical/hreflang assertions in `e2e/services.spec.ts`.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

import { servicesSignals } from "./services-page";
import { isIndexable, thinContentReason } from "@/lib/seo";
import type { ServiceListItem } from "@/server/repositories/service";

/**
 * The thin-content signals for `/services` (Story 2.6, AC5 / FR42a).
 *
 * This is the function BOTH the page's `robots` metadata and `sitemap.ts` call,
 * so a defect here desynchronises them silently — a page saying `noindex` while
 * the sitemap advertises it is the mixed signal FR42a exists to prevent. That
 * has now happened three times in this project (1.9, the 2.1 review's
 * `/industries` index, the 2.4 review's product signals), which is why the
 * shared predicate gets its own tests instead of being assumed.
 */
function service(over: Partial<ServiceListItem> = {}): ServiceListItem {
  return {
    id: "svc-1",
    slug: "technical-selection",
    name: "Technical selection",
    description: "Specification-led product selection.",
    isFallback: false,
    ...over,
  };
}

describe("servicesSignals", () => {
  it("a populated page is indexable in the default locale", () => {
    expect(isIndexable(servicesSignals("en", [service(), service({ id: "svc-2" })]))).toBe(true);
  });

  it("counts the services as the page's content", () => {
    expect(servicesSignals("en", [service(), service({ id: "svc-2" })]).itemCount).toBe(2);
  });

  it("is EMPTY — and not indexable — with no services", () => {
    const signals = servicesSignals("en", []);
    expect(thinContentReason(signals)).toBe("empty");
    expect(isIndexable(signals)).toBe(false);
  });

  it("is fallback-only when EVERY service fell back — the current seed on /tr and /ru", () => {
    // No service carries a TR or RU translation, so both non-default locales are
    // legitimately noindex until the content is translated.
    const signals = servicesSignals("tr", [
      service({ isFallback: true }),
      service({ id: "svc-2", isFallback: true }),
    ]);
    expect(thinContentReason(signals)).toBe("fallback-only");
    expect(isIndexable(signals)).toBe(false);
  });

  it("stays indexable when ANY service carries real locale content", () => {
    // Partial fallback still shows the visible notice; it is not a reason to hide
    // the page (the project-wide rule, settled in Story 1.9's Q4).
    const signals = servicesSignals("tr", [
      service({ isFallback: true }),
      service({ id: "svc-2", isFallback: false }),
    ]);
    expect(thinContentReason(signals)).toBeNull();
  });

  it("never calls EN fallback-only — the source language cannot fall back to itself", () => {
    const signals = servicesSignals("en", [service({ isFallback: true })]);
    expect(thinContentReason(signals)).toBeNull();
  });
});
