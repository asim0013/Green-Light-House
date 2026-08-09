import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider, type Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { siteOrigin } from "@/lib/seo";
import { HTML_CLASS, BODY_CLASS } from "@/components/layout/fonts";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
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
    // Required for the per-page `alternates` in child routes to resolve: without it
    // Next cannot turn a relative metadata URL into an absolute one, and canonical
    // / hreflang are meaningless relative. Read at request time (see `siteOrigin`).
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
        <NextIntlClientProvider>
          <SiteHeader />
          {/*
            Single <main> for the whole locale segment — the skip-link target.
            `tabIndex={-1}` makes it programmatically focusable so activating the
            skip link actually MOVES focus (fragment navigation alone doesn't in
            Safari/Firefox). Flex column so children can claim the free height.
          */}
          <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
            {props.children}
          </main>
          <SiteFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
