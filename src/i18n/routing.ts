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
  // OFF deliberately (Story 1.9). next-intl's proxy otherwise emits hreflang as
  // HTTP `Link:` response headers, which would be a SECOND source of truth beside
  // the per-page `alternates` in `src/lib/seo.ts` — and the header version keeps
  // advertising alternates for pages we have deliberately marked `noindex`.
  // Document-level tags are authoritative; FR42a wants them in the page anyway.
  alternateLinks: false,
  // `localeCookie` is enabled by default (`NEXT_LOCALE`): navigating through the
  // next-intl middleware/navigation APIs remembers the chosen locale, so a later
  // request to `/` redirects to it (Story 1.4 persistence — do not disable).
});
