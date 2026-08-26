import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";
import type { SearchSuggestion } from "@/server/repositories/product";

/**
 * FR17a's zero-result state (Story 2.5) — DISTINCT from `CatalogEmptyState` on
 * purpose. FR16's state says "we don't list this category yet"; this one says
 * "your SEARCH matched nothing" — different situation, different words, and
 * FR17a prescribes three affordances FR16 has no business carrying: broader-term
 * suggestions, the category-browse path, and an RFQ action PRE-FILLED with the
 * query text. This is also the "standard zero-result state" Story 2.7's
 * degradation AC references (its "(Story 2.4)" pointer is a stale number).
 *
 * SUGGESTIONS ARE PRODUCTS, NOT QUERIES (decision Q4): `pg_trgm` similarity on
 * the normalized model gives real "did you mean FD-9500" neighbours from the
 * live catalogue, each linking straight to its detail page. The model renders in
 * the data mono beside the name.
 *
 * THE RFQ PRE-FILL PARAM IS `q` — recorded as this story's contract with Story
 * 3.4 (doorway pre-fill): `/rfq?q=<encoded query>`. `/rfq` is LIVE since Story
 * 3.2, but 3.2 deliberately reads NO query params, so the value is accepted and
 * DROPPED until 3.4 wires pre-fill — that window is disclosed, not a defect.
 * EXPERIENCE.md:82's register: "we may still supply it — request it".
 */
export function SearchEmptyState({
  query,
  suggestions,
}: {
  query: string;
  suggestions: readonly SearchSuggestion[];
}) {
  const t = useTranslations("Catalog");
  const tNav = useTranslations("Nav");

  return (
    <div className="max-w-[62ch] py-4">
      <h2 className="font-heading text-xl font-bold tracking-tight text-ink">
        {t("zeroTitle", { query })}
      </h2>
      <p className="mt-3 leading-relaxed text-ink-2">{t("zeroLead")}</p>

      {suggestions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
            {t("zeroSuggestionsTitle")}
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {suggestions.map((suggestion) => (
              <li key={suggestion.slug}>
                <Link
                  href={`/products/${encodeURIComponent(suggestion.slug)}`}
                  className="inline-flex items-center gap-2 text-[15px] font-semibold text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11"
                >
                  <span className="font-data">{suggestion.model}</span>
                  <span
                    className="font-normal text-ink-2"
                    lang={suggestion.isFallback ? "en" : undefined}
                  >
                    {suggestion.name}
                  </span>
                  {/* The VISIBLE notice, not just lang= — every other fallback
                      string on the site carries it, and this was the one place
                      marking a fallback invisibly (2.5 review). */}
                  <FallbackNotice isFallback={suggestion.isFallback} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The category-browse path FR17a names: the chips above this state stay
          live, so the copy points UP rather than duplicating navigation here. */}
      <p className="mt-6 leading-relaxed text-ink-2">{t("zeroBrowse")}</p>

      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Link
          href={`${SITE.rfqHref}?q=${encodeURIComponent(query)}`}
          className={buttonClasses("primary")}
        >
          {t("zeroCta", { query })}
        </Link>
        <a
          href={`tel:${SITE.phone}`}
          aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
          className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-data text-[15px] text-ink hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Phone size={16} aria-hidden />
          {SITE.phoneDisplay}
        </a>
      </div>
    </div>
  );
}
