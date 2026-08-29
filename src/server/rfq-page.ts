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
 * ⚠️ STORY 3.5 MOVED THE SLA OUT OF `messages/`, so "messages-driven BY
 * CONSTRUCTION" is no longer literally true of everything this page renders —
 * the process card is DB content that can fall back like any other row. It is
 * DELIBERATELY EXCLUDED from these signals anyway: the SLA is chrome that
 * appears on every route, not this page's own content, and it renders
 * identically on eight surfaces. Counting it would make a site-wide element
 * decide a per-page question — and because it is fully translated it would push
 * thin pages TOWARD indexing, which is the exact mixed signal FR42a exists to
 * prevent. Same reasoning in `services-page.ts` and the homepage.
 *
 * Consumed by BOTH the page's `generateMetadata` and `sitemap.ts`, so the
 * robots tag and the sitemap's inclusion rule can never disagree (FR42a).
 */
export function rfqSignals(locale: Locale): ContentSignals {
  return { locale, itemCount: 1 };
}
