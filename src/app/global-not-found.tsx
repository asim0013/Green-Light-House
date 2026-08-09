import type { Metadata } from "next";
import { headers } from "next/headers";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { HTML_CLASS, BODY_CLASS } from "@/components/layout/fonts";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { NotFoundContent } from "@/components/layout/NotFoundContent";
import "./globals.css";

/**
 * The 404 for every unmatched URL (Story 1.9, AC6).
 *
 * WHY THIS FILE EXISTS AT ALL — the story recommended a `[locale]/[...rest]`
 * catch-all instead, and that was WRONG for this codebase. Measured: the catch-all
 * does make `[locale]/not-found.tsx` render, but NOT inside `[locale]/layout.tsx`
 * — Next serves it in a bare `<html id="__next_error__">` shell with no `lang`, no
 * header and no footer, which is the exact WCAG 3.1.1 defect this AC exists to
 * close. Next's own docs name this situation: `global-not-found` is for when you
 * "can't build a 404 page using a combination of layout.js and not-found.js"
 * because "your root layout is defined using top-level dynamic segments
 * (e.g. app/[country]/layout.tsx)". That is precisely `app/[locale]/layout.tsx`.
 *
 * It is behind `experimental.globalNotFound` in next.config.ts (16.2.12). The cost
 * is that it bypasses layouts, so it must declare its own document — hence the
 * shared `fonts.ts` and `NotFoundContent`, so nothing can drift from the real shell.
 */

/**
 * The locale for a request that matched no route.
 *
 * `global-not-found` receives no props, and the `NEXT_LOCALE` cookie is not yet
 * readable on a cold request (verified — `cookies()` returns empty while the
 * proxy is still setting it in the same cycle). The proxy does, however, pass
 * next-intl's own `x-next-intl-locale` request header, which is present even on a
 * first visit.
 *
 * Validated against `routing.locales` rather than trusted: if next-intl ever
 * renames or drops that header this degrades to the default locale, which keeps
 * `lang` and the rendered copy in agreement — a wrong-but-consistent language is
 * recoverable, a `lang` that contradicts the text is an accessibility defect.
 */
async function resolveLocale() {
  const requested = (await headers()).get("x-next-intl-locale");
  return hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await resolveLocale();
  const t = await getTranslations({ locale, namespace: "NotFound" });
  // Next injects `noindex` automatically for anything returning a 404 status.
  return { title: t("title") };
}

export default async function GlobalNotFound() {
  const locale = await resolveLocale();
  const messages = await getMessages({ locale });

  return (
    <html lang={locale} className={HTML_CLASS}>
      <body className={BODY_CLASS}>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <SiteHeader />
          {/* Same landmark and skip-link target as the real layout, so the bypass
              does not cost the user the bypass-blocks affordance. */}
          <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
            <NotFoundContent />
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
