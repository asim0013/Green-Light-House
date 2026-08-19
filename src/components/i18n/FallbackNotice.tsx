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
export type FallbackNoticeTone = "light" | "onDark";

export function FallbackNotice({
  isFallback,
  tone = "light",
}: {
  isFallback: boolean;
  /**
   * Must match the surface. The default `ink-2` is a LIGHT-surface token: on the
   * `ink` band it measures 2.96:1, an AA failure — on the one string UJ3's whole
   * "fallback is honest" promise rests on. `onDark` uses `on-dark-text` (10.66:1),
   * the same token DarkBand sets for body copy.
   */
  tone?: FallbackNoticeTone;
}) {
  const t = useTranslations("Common");

  if (!shouldShowFallbackNotice(isFallback)) return null;

  return (
    <span
      className={`ml-2 align-middle text-xs font-normal ${
        tone === "onDark" ? "text-on-dark-text" : "text-ink-2"
      }`}
    >
      ({t("shownInEnglish")})
    </span>
  );
}
