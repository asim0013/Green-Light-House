import { useTranslations } from "next-intl";
import { shouldShowFallbackNotice } from "./fallback";

/**
 * Unobtrusive "shown in English" marker for a DB content field that fell back to
 * EN (Story 1.2 resolver `isFallback`). Renders nothing when the content is in
 * the requested locale.
 *
 * The label itself is a localized UI string (shown in the current locale). The
 * fallen-back *content* is marked `lang="en"` by the caller so screen readers
 * announce the language switch (AC4) — this component only renders the honest
 * "fallback happened" hint next to it.
 */
export function FallbackNotice({ isFallback }: { isFallback: boolean }) {
  const t = useTranslations("Common");

  if (!shouldShowFallbackNotice(isFallback)) return null;

  return (
    <span className="ml-2 align-middle text-xs font-normal text-zinc-500 dark:text-zinc-400">
      ({t("shownInEnglish")})
    </span>
  );
}
