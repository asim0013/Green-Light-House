import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Inter, Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import { hasLocale, NextIntlClientProvider, type Locale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import "../globals.css";

// The four DESIGN.md families (Story 1.5). Geist / Geist Mono have NO cyrillic
// subset, so their token stacks in globals.css fall back to Inter / IBM Plex Mono
// (both cover cyrillic) — see globals.css `--font-heading` / `--font-mono`.

// body voice — full latin/latin-ext/cyrillic; also the cyrillic fallback for headings.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

// heading voice — latin + latin-ext only (no cyrillic subset exists for Geist).
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "latin-ext"],
});

// mono / label voice (UPPERCASE kickers, chips, table headers) — no cyrillic subset.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

// data voice (model numbers, specs, quantities, dates, refs) — covers cyrillic, so
// it also serves as the cyrillic fallback for the mono/label stack.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600"],
});

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
    <html
      lang={locale}
      className={`${inter.variable} ${geist.variable} ${geistMono.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <NextIntlClientProvider>
          {/* TEMPORARY header (Story 1.4) — hosts the language switcher until the
              real global nav/footer lands in Story 1.6. Minimal styling, no nav
              links / phone / CTA yet (that's 1.6). */}
          <header className="flex justify-end border-b border-border-subtle px-6 py-3">
            <LanguageSwitcher />
          </header>
          {props.children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
