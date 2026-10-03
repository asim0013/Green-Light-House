import type { Locale } from "next-intl";
import type { ContentSignals } from "@/lib/seo";
import { LEGAL, type LegalApprovals } from "@/config/legal";

/**
 * The legal pages' indexability predicate (Story 5.1 — one predicate per surface).
 *
 * ⚠️ ONE FUNCTION, THREE PAGES, ONE SITEMAP. `/privacy`, `/terms` and `/cookies`
 * all call this for their `robots` metadata, and `sitemap.ts` calls it for their
 * inclusion. A single review (both `approvals`) therefore lifts all three
 * together, and the robots tag can never disagree with the sitemap (FR42a — the
 * drift this project has hit THREE times).
 *
 * ⚠️ `fallbackFields`/`totalFields` ARE OMITTED DELIBERATELY — the same half
 * that would have caused real damage on `/contact` (`contact-page.ts:19-27`).
 * Legal copy is structurally locale-invariant and the `Legal` namespace is
 * parity-gated by `messages.test.ts`, so "empty" and "fallback-only" are states
 * these pages cannot reach. Feeding a fallback ratio would make
 * `fallbackFields === totalFields` for every non-EN locale and permanently
 * `noindex` `/tr` and `/ru` — pages correctly serving Turkish and Russian copy,
 * marked unfit to index forever.
 *
 * `isPlaceholder` is the operative gate; `itemCount` is a positive constant only
 * so the page never reads as "empty" through `itemCount`.
 */
const LEGAL_DOC_COUNT = 3;

export function legalSignals(
  locale: Locale,
  approvals: LegalApprovals = LEGAL.approvals,
): ContentSignals {
  return {
    locale,
    itemCount: LEGAL_DOC_COUNT,
    /**
     * Noindex until BOTH human gates are set. Not `itemCount === 0` (the copy is
     * always present); the placeholder state is "drafted but not yet cleared for
     * search", exactly the `/privacy` stub and `/contact` precedent.
     */
    isPlaceholder: !(approvals.legalReviewed && approvals.translationsReviewed),
  };
}
