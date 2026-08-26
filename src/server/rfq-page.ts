import type { Locale } from "@prisma/client";
import type { ContentSignals } from "@/lib/seo";

/**
 * `/rfq`'s indexability predicate (Story 3.2, AC10 — one predicate per surface).
 *
 * CONSTANT-INDEXABLE, ALL THREE LOCALES — the first surface where /tr and /ru
 * index from day one (Task 0 #9). Every DB surface derives its signals from row
 * counts and fallback ratios because its content can be thin; this page's
 * content is messages-driven and locale-complete BY CONSTRUCTION — the parity
 * gate (`src/i18n/messages.test.ts`) fails the build if any locale misses a
 * key, so "fallback-only" is not a state this page can reach. The PID industry
 * list the form offers is an input, not the page's content: an empty industry
 * select is still a fully usable inquiry form (the field is optional), so
 * `itemCount` must not be derived from it.
 *
 * Consumed by BOTH the page's `generateMetadata` and `sitemap.ts`, so the
 * robots tag and the sitemap's inclusion rule can never disagree (FR42a).
 */
export function rfqSignals(locale: Locale): ContentSignals {
  return { locale, itemCount: 1 };
}
