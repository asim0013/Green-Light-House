import type { Locale } from "@prisma/client";
import type { ContentSignals } from "@/lib/seo";
import type { GuideDetail, GuideListItem } from "@/server/repositories/selection-guide";

/**
 * Selection-guide indexability (Story 4.11 — FR42/FR42a). The ONE predicate both
 * the guide page's `generateMetadata` (robots) and `sitemap.ts` (inclusion) read,
 * so the robots tag and the sitemap can never disagree — the pair that has
 * drifted repeatedly in this project (see `contactSignals`).
 *
 * The public reader returns PUBLISHED guides only, so a draft/unknown slug
 * arrives here as `null` → placeholder → noindex + absent from the sitemap. A
 * published guide needs real prose (an intro OR ≥1 section) to index — curated
 * product/category links alone do not lift a prose-less guide — and a non-EN
 * locale that fell back to EN for its own title/intro is `fallback-only` (not
 * advertised in that locale), matching FR34a and the chrome-vs-content rule.
 */
/** The single formula: a guide needs prose (intro or ≥1 section); non-EN fallback → fallback-only. */
function signalsFromParts(
  locale: Locale,
  parts: { hasIntro: boolean; sectionCount: number; isFallback: boolean },
): ContentSignals {
  return {
    locale,
    itemCount: (parts.hasIntro ? 1 : 0) + parts.sectionCount,
    fallbackFields: parts.isFallback ? 1 : 0,
    totalFields: 1,
  };
}

export function guideSignals(locale: Locale, guide: GuideDetail | null): ContentSignals {
  if (!guide) return { locale, itemCount: 0, isPlaceholder: true };
  return signalsFromParts(locale, {
    hasIntro: Boolean(guide.intro),
    sectionCount: guide.sections.length,
    isFallback: guide.isFallback,
  });
}

/** The sitemap's per-guide gate — same formula from a list item (no detail read needed). */
export function guideListItemSignals(locale: Locale, item: GuideListItem): ContentSignals {
  return signalsFromParts(locale, {
    hasIntro: Boolean(item.intro),
    sectionCount: item.sectionCount,
    isFallback: item.isFallback,
  });
}

/**
 * The `/guides` index indexability: indexable once at least one published guide
 * exists; a non-EN index that is entirely EN-fallback is `fallback-only`. Mirrors
 * the sitemap's `collectionsIndexable` shape (counts + fallback ratio).
 */
export function guidesIndexSignals(
  locale: Locale,
  guides: readonly GuideListItem[],
): ContentSignals {
  return {
    locale,
    itemCount: guides.length,
    fallbackFields: guides.filter((g) => g.isFallback).length,
    totalFields: guides.length,
  };
}
