// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * `@/lib/seo` reaches `@/i18n/navigation` → next-intl's `createNavigation`,
 * which imports `next/navigation` and does not resolve under Vitest. Stubbed
 * with a faithful `getPathname`, the convention `services-page`, `industry-page`
 * and `product-page` already use.
 *
 * ⚠️ AN EARLIER DRAFT OF THIS FILE CLAIMED THE STUB WAS UNNECESSARY because
 * this module "imports only the types". That was false — `isIndexable` and
 * `thinContentReason` are VALUE imports, so the whole `@/lib/seo` graph loads.
 * The claim cost one red run; it is recorded because "only the types" is exactly
 * the assumption that took every public page to HTTP 500 during Story 3.5.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

import { contactSignals } from "./contact-page";
import { isIndexable, thinContentReason } from "@/lib/seo";
import {
  CONTACT,
  configuredChannels,
  isFullyConfigured,
  type ContactDetails,
} from "@/config/contact";

/**
 * The thin-content signals for `/contact` (Story 3.8, AC5 / FR42a).
 *
 * This is the function BOTH the page's `robots` metadata and `sitemap.ts` call,
 * so a defect here desynchronises them silently — a page saying `noindex` while
 * the sitemap advertises it is the mixed signal FR42a exists to prevent. That
 * has now happened three times in this project (1.9, the 2.1 review, the 2.4
 * review), which is why the shared predicate gets its own tests.
 *
 */

function supplied(over: Partial<ContactDetails> = {}): ContactDetails {
  return {
    email: "inquiries@example.test",
    address: "1 Example Sokak\n34000 İstanbul",
    legal: {
      legalName: "Example Ticaret A.Ş.",
      tradeRegistryNo: "123456",
      taxOffice: "Beşiktaş",
      taxNo: "1234567890",
      mersisNo: "0123456789012345",
    },
    approvals: { legalReviewed: true, translationsReviewed: true },
    ...over,
  };
}

describe("contactSignals — the unconfigured state", () => {
  it("is a PLACEHOLDER in every locale while nothing is supplied", () => {
    // The day-one contract: /contact is reachable and useful (it carries the
    // phone and the inquiry form) but must not advertise itself as a contact
    // page whose details it does not have.
    //
    // ⚠️ ASSERTED ON A FIXTURE, NOT ON `CONTACT`. This block used to read the
    // shipped constant and pin `itemCount === 0`, so the day GLH supplied the
    // values it went RED for no defect — while the story and the commit message
    // both promised supplying them was a values-only change. The property under
    // test is "nothing supplied ⇒ placeholder", which is a property of the
    // function, not of today's config.
    const empty = supplied({
      email: null,
      address: null,
      legal: {
        legalName: null,
        tradeRegistryNo: null,
        taxOffice: null,
        taxNo: null,
        mersisNo: null,
      },
      approvals: { legalReviewed: false, translationsReviewed: false },
    });
    for (const locale of ["en", "tr", "ru"] as const) {
      const signals = contactSignals(locale, empty);
      expect(signals.itemCount).toBe(0);
      expect(signals.isPlaceholder).toBe(true);
      expect(thinContentReason(signals)).toBe("placeholder");
      expect(isIndexable(signals)).toBe(false);
    }
  });

  it("the SHIPPED config agrees with its own channel list, in whatever state it is in", () => {
    // Derived, not pinned — holds on day one and after GLH delivers.
    for (const locale of ["en", "tr", "ru"] as const) {
      const signals = contactSignals(locale, CONTACT);
      expect(signals.itemCount).toBe(configuredChannels(CONTACT).length);
      expect(signals.isPlaceholder).toBe(!isFullyConfigured(CONTACT));
      expect(isIndexable(signals)).toBe(isFullyConfigured(CONTACT));
    }
  });

  it("⛔ values WITHOUT the two human gates are still a placeholder", () => {
    // The critical Story 3.8 review finding, at the signals layer: filling the
    // config used to flip all three locales to `index, follow` and into
    // sitemap.xml with nothing to stop it, over two written pre-launch reviews.
    // P5: drop the `translationsReviewed` term from `isFullyConfigured` and
    // this reddens.
    const unapproved = supplied({
      approvals: { legalReviewed: false, translationsReviewed: false },
    });
    const signals = contactSignals("en", unapproved);
    expect(signals.itemCount).toBe(2); // legal withheld pending legal review
    expect(signals.isPlaceholder).toBe(true);
    expect(isIndexable(signals)).toBe(false);
  });
});

describe("contactSignals — it LIFTS ITSELF once the required set arrives", () => {
  it("is indexable in every locale when email, address and the registered name are supplied", () => {
    // ⚠️ THE DIRECTION THAT ACTUALLY MATTERS. A predicate that only ever says
    // "no" passes every test while being permanently wrong, and this page is
    // designed to flip with a values-only change. If this fails, supplying the
    // content would NOT publish the page and nobody would find out until GLH
    // asked why /contact was still invisible.
    for (const locale of ["en", "tr", "ru"] as const) {
      const signals = contactSignals(locale, supplied());
      expect(signals.itemCount).toBe(3);
      expect(signals.isPlaceholder).toBe(false);
      expect(thinContentReason(signals)).toBeNull();
      expect(isIndexable(signals), `${locale} should be indexable`).toBe(true);
    }
  });

  it("⚠️ counts TR and RU exactly as EN — the values are locale-invariant", () => {
    // The defect this forbids: routing the untranslated address and tax number
    // through `fallbackFields`/`totalFields` would make every non-EN locale
    // "fallback-only" and noindex /tr/contact and /ru/contact FOREVER.
    // P5: add `fallbackFields: 3, totalFields: 3` to the return and the two
    // non-EN assertions here redden while EN stays green — which is precisely
    // how this defect would have shipped unnoticed.
    const en = contactSignals("en", supplied());
    expect(contactSignals("tr", supplied())).toEqual({ ...en, locale: "tr" });
    expect(contactSignals("ru", supplied())).toEqual({ ...en, locale: "ru" });
    expect(en.fallbackFields).toBeUndefined();
    expect(en.totalFields).toBeUndefined();
  });
});

describe("contactSignals — partial configuration is NOT enough to publish", () => {
  it("stays a placeholder with one channel, even though itemCount is non-zero", () => {
    // ⚠️ THE REASON `isPlaceholder` IS NOT `channels.length === 0`. With only an
    // email the count is 1, so `itemCount` alone would let the page index while
    // the address and the registered name are missing.
    // P5: change `isPlaceholder` to `channels.length === 0` and this reddens.
    const emailOnly = supplied({
      address: null,
      legal: {
        legalName: null,
        tradeRegistryNo: null,
        taxOffice: null,
        taxNo: null,
        mersisNo: null,
      },
    });
    const signals = contactSignals("en", emailOnly);
    expect(signals.itemCount).toBe(1);
    expect(signals.isPlaceholder).toBe(true);
    expect(isIndexable(signals)).toBe(false);
  });

  it("counts each configured channel, so the sitemap and robots see the same number", () => {
    const noLegal = supplied({
      legal: {
        legalName: null,
        tradeRegistryNo: null,
        taxOffice: null,
        taxNo: null,
        mersisNo: null,
      },
    });
    expect(contactSignals("en", noLegal).itemCount).toBe(2);
  });
});
