import type { Locale } from "@prisma/client";

/** The fallback locale when a requested translation is missing (FR34a). */
export const DEFAULT_LOCALE: Locale = "en";

export interface Resolved<T> {
  /** The chosen translation row. */
  value: T;
  /** True when the requested locale was absent and we fell back to EN. */
  isFallback: boolean;
  /** The locale actually returned. */
  resolvedLocale: Locale;
}

/**
 * Resolve a localized row from an entity's `*_translations` rows.
 *
 * Returns the row for `requested`, else the EN row flagged as a fallback, else
 * `null` when neither exists. This is the data-layer half of FR34a; the visible
 * "shown in English" UI indicator is Story 1.3.
 */
export function resolveTranslation<T extends { locale: Locale }>(
  translations: readonly T[],
  requested: Locale,
): Resolved<T> | null {
  const exact = translations.find((t) => t.locale === requested);
  if (exact) return { value: exact, isFallback: false, resolvedLocale: requested };

  const fallback = translations.find((t) => t.locale === DEFAULT_LOCALE);
  if (fallback) return { value: fallback, isFallback: true, resolvedLocale: DEFAULT_LOCALE };

  return null;
}
