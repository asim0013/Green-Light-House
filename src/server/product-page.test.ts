// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * `product-page.ts` reaches `@/lib/seo` → `@/i18n/navigation` → next-intl's
 * `createNavigation`, which imports `next/navigation` and does not resolve under
 * Vitest. Stubbed with a faithful `getPathname`, the convention `industry-page`
 * and `HomeHero` already use. The REAL `getPathname` is covered end-to-end by the
 * canonical/hreflang assertions in `e2e/product-detail.spec.ts`.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

import { productSignals, productHref, type ProductSignalSource } from "./product-page";
import { isIndexable, thinContentReason } from "@/lib/seo";

/**
 * The thin-content signals for the product detail surface (Story 2.4, AC8 /
 * FR42a).
 *
 * This is the function BOTH the page's `robots` metadata and `sitemap.ts` call, so
 * a defect here desynchronises them silently — a page saying `noindex` while the
 * sitemap still advertises it is exactly the mixed signal FR42a exists to prevent.
 * Story 1.9 shipped that bug, and the 2.1 review found `/industries` doing it
 * again, so the shared predicate gets its own tests rather than being assumed.
 */
function source(over: Partial<ProductSignalSource> = {}): ProductSignalSource {
  return {
    isFallback: false,
    manufacturerIsFallback: false,
    categoryIsFallback: false,
    specCount: 4,
    documentCount: 2,
    ...over,
  };
}

describe("productSignals", () => {
  it("a product with specs is indexable in the default locale", () => {
    expect(isIndexable(productSignals("en", source()))).toBe(true);
  });

  it("counts specs AND documents as the page's substantive rows", () => {
    expect(productSignals("en", source({ specCount: 3, documentCount: 2 })).itemCount).toBe(5);
  });

  it("is EMPTY — and not indexable — with no specs and no documents", () => {
    // A catalogue stub: the row exists, the page has nothing on it.
    const signals = productSignals("en", source({ specCount: 0, documentCount: 0 }));
    expect(thinContentReason(signals)).toBe("empty");
    expect(isIndexable(signals)).toBe(false);
  });

  it("stays indexable on documents alone when a product has no attributes", () => {
    expect(isIndexable(productSignals("en", source({ specCount: 0, documentCount: 1 })))).toBe(
      true,
    );
  });

  it("is fallback-only when EVERY identity field fell back", () => {
    const signals = productSignals("tr", {
      ...source(),
      isFallback: true,
      manufacturerIsFallback: true,
      categoryIsFallback: true,
    });
    expect(thinContentReason(signals)).toBe("fallback-only");
    expect(isIndexable(signals)).toBe(false);
  });

  it("stays indexable when ANY identity field carries real locale content", () => {
    // Measured on the seed: `gd-410` is EN-only but its CATEGORY has a TR name,
    // so /tr/products/gd-410 is indexable and appears in the TR sitemap. Partial
    // fallback still shows the visible notice; it is not a reason to hide the page.
    const signals = productSignals("tr", {
      ...source(),
      isFallback: true,
      manufacturerIsFallback: true,
      categoryIsFallback: false,
    });
    expect(thinContentReason(signals)).toBeNull();
  });

  it("never calls EN fallback-only — the source language cannot fall back to itself", () => {
    const signals = productSignals("en", {
      ...source(),
      isFallback: true,
      manufacturerIsFallback: true,
      categoryIsFallback: true,
    });
    expect(thinContentReason(signals)).toBeNull();
  });

  it("counts exactly three identity fields", () => {
    expect(productSignals("tr", source()).totalFields).toBe(3);
  });
});

describe("productHref", () => {
  it("builds the locale-relative detail path", () => {
    expect(productHref("fd-9500")).toBe("/products/fd-9500");
  });

  it("ENCODES the slug — Next does not escape sitemap <loc>", () => {
    // An unescaped `&` or `<` makes /sitemap.xml malformed for EVERY locale at
    // once, not just this entry. Nothing constrains Product.slug beyond @unique.
    expect(productHref("a&b")).toBe("/products/a%26b");
    expect(productHref('x"<y>')).toBe("/products/x%22%3Cy%3E");
  });

  it("is a no-op for a well-formed slug", () => {
    expect(productHref("fd-9500-mk2")).toBe("/products/fd-9500-mk2");
  });
});
