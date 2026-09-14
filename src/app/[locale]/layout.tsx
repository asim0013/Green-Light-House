import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider, type Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { siteOrigin } from "@/lib/seo";
import { HTML_CLASS, BODY_CLASS } from "@/components/layout/fonts";
import "../globals.css";

// The four DESIGN.md families (Story 1.5) now live in `components/layout/fonts.ts`,
// shared with `app/global-not-found.tsx` — which bypasses layouts and must declare
// its own document, so the loaders cannot live here alone without drifting.

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(props: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  // Set the request locale so metadata stays consistent under static rendering.
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Meta" });
  return {
    // NOT what an earlier comment here claimed. `alternatesFor` already returns
    // ABSOLUTE URLs, and Next's resolver short-circuits those
    // ("if we can construct a URL instance from url, ignore metadataBase" —
    // lib/metadata/resolvers/resolve-url.js), so this does not make canonical or
    // hreflang resolve. What it actually does: normalises those values through
    // `new URL().href`, and gives any FUTURE relative metadata — Open Graph and
    // Twitter images in Story 5.x — a base other than localhost. Kept for that.
    metadataBase: new URL(siteOrigin()),
    title: t("title"),
    description: t("description"),
  };
}

export default async function LocaleLayout(props: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;

  // Guard the dynamic segment against unsupported locales.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering for all child Server Components in this segment.
  setRequestLocale(locale);

  return (
    <html lang={locale} className={HTML_CLASS}>
      <body className={BODY_CLASS}>
        {/*
          The document + i18n provider shell for the WHOLE locale segment. The
          public chrome (SiteHeader / <main> skip-target / SiteFooter) lives in
          `(public)/layout.tsx` so that `admin/` — which is NOT in that group —
          renders its own frame without the public header, footer or RFQ CTA
          (Story 4.1; the admin app shell is Story 4.2).
        */}
        <NextIntlClientProvider>{props.children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
