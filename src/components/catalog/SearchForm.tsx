import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/buttonClasses";

/**
 * The model-number search (Story 2.5 — FR17; UJ2's opening beat is a PASTED
 * model string).
 *
 * A PLAIN GET FORM, deliberately (decision Q2 / UX-DR23 "content-first SSR").
 * Submitting navigates to `/products?q=…` and the server renders the results —
 * no client JS, no debounce, no fetch, no skeletons (those are for client
 * transitions, which this page does not have). architecture:102 binds "URL
 * `searchParams` for catalog filters"; the `api/search` route the architecture
 * inventory also names is DELIBERATELY not built — a route handler with no
 * client caller is dead code. It becomes real when a typeahead does (2.7).
 *
 * The action must carry the LOCALE segment — a bare "/products" would drop it
 * and bounce through the locale redirect, losing the query on the way.
 *
 * Active filters ride along as hidden inputs, so typing a new query keeps the
 * narrowed view instead of silently resetting it.
 */
export function SearchForm({
  query,
  categorySlug,
  manufacturerSlug,
  seriesSlug,
}: {
  query: string | null;
  categorySlug: string | null;
  manufacturerSlug: string | null;
  seriesSlug: string | null;
}) {
  const t = useTranslations("Catalog");
  const locale = useLocale();
  const action = getPathname({ locale, href: "/products" });

  return (
    <form role="search" action={action} method="get" className="mt-6 flex max-w-xl gap-2">
      <label htmlFor="catalog-search" className="sr-only">
        {t("searchLabel")}
      </label>
      <input
        id="catalog-search"
        // type="search" is KEPT: it carries the implicit `searchbox` role that the
        // suite and assistive tech both rely on. WebKit's rounded clear button is
        // suppressed in CSS instead (2.5 review) — swapping to type="text" fixed
        // the chrome and silently broke the role, which the tests caught.
        type="search"
        name="q"
        defaultValue={query ?? ""}
        placeholder={t("searchPlaceholder")}
        // Machine data goes in, so the input renders in the data mono — the same
        // "a machine produced it" rule the model line on the card follows.
        className="min-h-11 w-full border border-muted bg-surface px-3 font-data text-[14px] text-ink placeholder:text-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-search-cancel-button]:appearance-none"
      />
      {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
      {manufacturerSlug && <input type="hidden" name="manufacturer" value={manufacturerSlug} />}
      {seriesSlug && <input type="hidden" name="series" value={seriesSlug} />}
      <button type="submit" className={`${buttonClasses("primary")} shrink-0`}>
        <Search size={15} aria-hidden className="mr-1.5" />
        {t("searchSubmit")}
      </button>
    </form>
  );
}
