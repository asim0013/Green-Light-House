// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * `industry-page.ts` reaches `@/lib/seo` → `@/i18n/navigation` → next-intl's
 * `createNavigation`, which imports `next/navigation` and does not resolve under
 * Vitest. Stubbed with a faithful `getPathname`, following the convention already
 * established in `HomeHero.test.tsx`. The REAL `getPathname` is covered end-to-end
 * by the canonical/hreflang assertions in `e2e/industries.spec.ts`.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

import { industrySignals, industriesIndexSignals, industryHref } from "./industry-page";
import { isIndexable, thinContentReason } from "@/lib/seo";
import type { IndustryPageData } from "./industry-page";

/**
 * The thin-content signals for the industry surfaces (Story 2.1, AC7 / FR42a).
 *
 * Task 6 called for exactly this and the story record claimed it was done while only
 * the block mappers had been covered — the code-review's acceptance auditor caught
 * the false claim. These are the functions BOTH the page's `robots` metadata and
 * `sitemap.ts` call, so a defect here desynchronises the two silently: a page that
 * says `noindex` while the sitemap still advertises it is precisely the mixed signal
 * FR42a exists to prevent.
 */

const row = (isFallback = false) => ({ id: "x", slug: "x", name: "X", isFallback });

function pageData(overrides: Partial<IndustryPageData> = {}): IndustryPageData {
  return {
    industry: {
      id: "i1",
      slug: "oil-gas",
      name: "Oil & Gas",
      description: null,
      isFallback: false,
    },
    categories: [],
    certificates: [],
    services: [],
    products: [],
    projects: [],
    ...overrides,
  } as IndustryPageData;
}

describe("industrySignals — one landing page", () => {
  it("an industry with EVERY block empty is thin, and therefore noindex", () => {
    // The seed's construction / manufacturing / nuclear. This is the case that keeps
    // three empty pages out of the index and out of the sitemap.
    const signals = industrySignals("en", pageData());
    expect(signals.itemCount).toBe(0);
    expect(thinContentReason(signals)).toBe("empty");
    expect(isIndexable(signals)).toBe(false);
  });

  it("ONE non-empty block is enough to be indexable (story decision Q4)", () => {
    // Deliberately the weakest possible case: a single service and nothing else.
    const signals = industrySignals("en", pageData({ services: [row()] as never }));
    expect(signals.itemCount).toBe(1);
    expect(isIndexable(signals)).toBe(true);
  });

  it("does NOT count the industry itself towards itemCount", () => {
    // If it did, every industry that exists would score at least 1 and no page could
    // ever be thin — the opposite of the policy.
    expect(industrySignals("en", pageData()).itemCount).toBe(0);
  });

  it("counts rows across ALL five blocks", () => {
    const signals = industrySignals(
      "en",
      pageData({
        categories: [row(), row()] as never,
        certificates: [row()] as never,
        services: [row()] as never,
        products: [row()] as never,
        projects: [row()] as never,
      }),
    );
    expect(signals.itemCount).toBe(6);
  });

  it("includes the industry's OWN fallback flag in the fallback signals", () => {
    // The industry name is the page's <h1>, so a page whose every rendered string
    // fell back to EN genuinely has nothing in the requested locale.
    const data = pageData({ services: [row(true)] as never });
    data.industry.isFallback = true;
    const signals = industrySignals("ru", data);
    expect(signals.fallbackFields).toBe(2);
    expect(signals.totalFields).toBe(2);
    expect(thinContentReason(signals)).toBe("fallback-only");
    expect(isIndexable(signals)).toBe(false);
  });

  it("is NOT fallback-only when some content exists in the requested locale", () => {
    const data = pageData({ services: [row(false)] as never });
    data.industry.isFallback = true;
    const signals = industrySignals("ru", data);
    // Both fields are optional on ContentSignals, so narrow before comparing.
    expect(signals.fallbackFields ?? 0).toBeLessThan(signals.totalFields ?? 0);
    expect(isIndexable(signals)).toBe(true);
  });

  it("never marks EN itself as fallback-only — EN is the source language", () => {
    const data = pageData({ services: [row(true)] as never });
    data.industry.isFallback = true;
    expect(isIndexable(industrySignals("en", data))).toBe(true);
  });
});

describe("industriesIndexSignals — the /industries index", () => {
  it("is indexable whenever any industry exists, even if every landing page is thin", () => {
    // A DIFFERENT surface from the landing pages: an index listing six sectors is
    // real content regardless of how empty those sectors are. The sitemap gates
    // `/industries` on THIS function, which is what keeps page and sitemap in step.
    const signals = industriesIndexSignals("en", [row(), row(), row()]);
    expect(signals.itemCount).toBe(3);
    expect(isIndexable(signals)).toBe(true);
  });

  it("is thin only when there are no industries at all", () => {
    expect(isIndexable(industriesIndexSignals("en", []))).toBe(false);
  });

  it("is fallback-only when every industry name fell back to EN", () => {
    expect(isIndexable(industriesIndexSignals("ru", [row(true), row(true)]))).toBe(false);
  });
});

describe("industryHref", () => {
  it("leaves a well-formed slug untouched", () => {
    expect(industryHref("oil-gas")).toBe("/industries/oil-gas");
    expect(industryHref("fire-safety")).toBe("/industries/fire-safety");
  });

  it("ENCODES the XML-hostile characters that would break the whole sitemap", () => {
    // Next emits `<loc>${url}</loc>` with no escaping (verified against
    // resolve-route-data.js), so one bad slug invalidates the entire file for every
    // locale — not just its own entry.
    expect(industryHref("a&b")).toBe("/industries/a%26b");
    expect(industryHref("a<b")).toBe("/industries/a%3Cb");
    expect(industryHref('a"b')).toBe("/industries/a%22b");
    for (const hostile of ["&", "<", ">", '"']) {
      expect(industryHref(`x${hostile}y`)).not.toContain(hostile);
    }
  });

  it("encodes spaces and non-ASCII rather than emitting a broken URL", () => {
    expect(industryHref("oil gas")).toBe("/industries/oil%20gas");
    expect(industryHref("нефть")).toBe("/industries/%D0%BD%D0%B5%D1%84%D1%82%D1%8C");
  });
});
