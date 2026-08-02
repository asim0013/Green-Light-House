import { defineRouting } from "next-intl/routing";

/**
 * Single source of truth for supported locales. These MUST stay in sync with the
 * Prisma `Locale` enum (en | tr | ru) — the URL locale and the DB translation
 * locale are the same three tokens. Reuse `routing.locales` everywhere; never
 * re-list the locales elsewhere.
 */
export const routing = defineRouting({
  locales: ["en", "tr", "ru"],
  defaultLocale: "en",
});
