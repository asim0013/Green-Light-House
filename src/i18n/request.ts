import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

/**
 * Per-request next-intl config. Validates the incoming `[locale]` segment against
 * the supported locales and falls back to the default (en) for anything else,
 * then loads that locale's UI-string messages.
 *
 * Note: this handles UI-STRING fallback only. Missing DB CONTENT translations are
 * handled separately by `server/i18n/resolveTranslation.ts` (Story 1.2), which
 * drives the "shown in English" indicator.
 */
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
