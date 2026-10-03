// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

/**
 * `@/lib/seo` reaches `@/i18n/navigation` → next-intl's `createNavigation`,
 * which imports `next/navigation` and does not resolve under Vitest. Stubbed
 * with a faithful `getPathname`, the convention `contact-page`, `services-page`,
 * `industry-page` and `product-page` already use. (`isIndexable`/`robotsFor` are
 * VALUE imports, so the whole `@/lib/seo` graph loads — "only the types" is the
 * false claim that took every public page to HTTP 500 in Story 3.5.)
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  Link: () => null,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

import { legalSignals } from "./legal-page";
import { isIndexable, robotsFor } from "@/lib/seo";
import { LEGAL, type LegalApprovals } from "@/config/legal";
import { PRIVACY_POLICY_VERSION } from "@/server/rfq/schema";
import { routing } from "@/i18n/routing";

/**
 * Story 5.1 — `/privacy`, `/terms`, `/cookies` share ONE indexability predicate
 * (`legalSignals`), consumed by each page's `generateMetadata` AND by
 * `sitemap.ts`, so robots and the sitemap cannot disagree (FR42a — the drift
 * this project has hit THREE times). Both human review gates must be set before
 * any legal page is advertised to search engines.
 */
const BOTH: LegalApprovals = { legalReviewed: true, translationsReviewed: true };
const LEGAL_ONLY: LegalApprovals = { legalReviewed: true, translationsReviewed: false };
const TRANSLATIONS_ONLY: LegalApprovals = { legalReviewed: false, translationsReviewed: true };

describe("legalSignals (Story 5.1 indexability predicate)", () => {
  it("is a placeholder (noindex) with the SHIPPED default approvals", () => {
    // Guards the fail-closed default: nothing is advertised until a human acts.
    const signals = legalSignals("en", LEGAL.approvals);
    expect(signals.isPlaceholder).toBe(true);
    expect(isIndexable(signals)).toBe(false);
  });

  it("renders real content — itemCount is positive, so 'empty' is never the reason", () => {
    // isPlaceholder is the operative gate; itemCount just must never read as empty
    // (the legal copy is content-complete by construction, messages.test-gated).
    expect(legalSignals("en", BOTH).itemCount).toBeGreaterThan(0);
  });

  it("becomes indexable only when BOTH approvals are set", () => {
    expect(isIndexable(legalSignals("en", BOTH))).toBe(true);
    expect(isIndexable(legalSignals("en", LEGAL_ONLY))).toBe(false);
    expect(isIndexable(legalSignals("en", TRANSLATIONS_ONLY))).toBe(false);
  });

  it("keeps follow=true in both states (thin pages' outbound links still crawl)", () => {
    expect(robotsFor(legalSignals("en", LEGAL.approvals)).follow).toBe(true);
    expect(robotsFor(legalSignals("en", BOTH)).follow).toBe(true);
  });

  it("the robots side and the sitemap side read the SAME value FROM legalSignals, all locales/states", () => {
    // ⚠️ WHAT THIS DOES AND DOES NOT PROVE (5.1 review, MEDIUM). This asserts that
    // `robotsFor(legalSignals(...)).index` and `isIndexable(legalSignals(...))` —
    // the computation each side performs — agree. Because both call the one
    // predicate, this is close to tautological: it guards the LOGIC, not the
    // WIRING. It CANNOT catch `sitemap.ts` hard-coding `legalIndexable: true` or a
    // page dropping its `robots:` line (proven: that mutation left this suite
    // green). That wiring-drift gate is owned by `e2e/legal.spec.ts`, which reads
    // the served robots meta and the actual sitemap.xml.
    for (const locale of routing.locales) {
      for (const approvals of [LEGAL.approvals, BOTH]) {
        const pageIndex = robotsFor(legalSignals(locale, approvals)).index;
        const sitemapIncludes = isIndexable(legalSignals(locale, approvals));
        expect(pageIndex, `${locale} robots vs sitemap computation must agree`).toBe(
          sitemapIncludes,
        );
      }
    }
  });
});

describe("the consent-version contract (Story 5.1 §C — the policy graduated from stub)", () => {
  it("PRIVACY_POLICY_VERSION no longer carries the 'stub' naming", () => {
    // The privacy wording was replaced with the real policy, so the stub id had
    // to be retired (its docstring mandates a bump on any Legal change). The
    // `/api/rfq` route composes `${PRIVACY_POLICY_VERSION}:<uiLocale>` from this
    // one constant, so the stamp moves with it.
    expect(PRIVACY_POLICY_VERSION).not.toContain("stub");
  });
});
