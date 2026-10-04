import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { legalSignals } from "@/server/legal-page";
import { COOKIES_EFFECTIVE } from "@/config/legal";
import { LegalDocument } from "@/components/legal/LegalDocument";

/**
 * `/cookies` — cookie policy (Story 5.1 — FR43, FR46). Essential cookies only —
 * the language-preference cookie (`NEXT_LOCALE`) and the consent-choice cookie
 * (`glh-consent`, Story 5.2); the admin session cookie is staff-only and out of
 * scope. The `noTracking` paragraph also discloses the Story 5.8 analytics: it is
 * COOKIELESS (so the "no non-essential cookies" statement stays true), consent-
 * gated, and collects no personal data — honest whether or not a Plausible host is
 * provisioned, because it runs only with consent.
 *
 * ⚠️ Still born `noindex` until `LEGAL.approvals.translationsReviewed` flips: the
 * analytics paragraph is machine-drafted TR/RU like the rest, so a native reviewer
 * must pass it before the page is advertised (owner-actions §3).
 *
 * Shares the `legalSignals` predicate with `/privacy`, `/terms` and `sitemap.ts`;
 * effective line from `COOKIES_EFFECTIVE` (its own, day-granular — the copy is
 * fingerprinted in `legal.test.ts`); uniform `force-dynamic`, no DB read.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Legal.cookies" });

  return {
    title: t("title"),
    alternates: alternatesFor(locale, "/cookies"),
    robots: robotsFor(legalSignals(locale)),
  };
}

export default async function CookiesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Legal.cookies" });

  return (
    <LegalDocument title={t("title")} versionLine={t("effective", { date: COOKIES_EFFECTIVE })}>
      <p>{t("intro")}</p>
      <p>{t("essential")}</p>
      <p>{t("noTracking")}</p>
    </LegalDocument>
  );
}
