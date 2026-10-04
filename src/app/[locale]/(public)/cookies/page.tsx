import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { legalSignals } from "@/server/legal-page";
import { LEGAL_EFFECTIVE } from "@/config/legal";
import { LegalDocument } from "@/components/legal/LegalDocument";

/**
 * `/cookies` — cookie policy (Story 5.1 — FR43, FR46-adjacent). Describes only
 * the cookies actually set TODAY: essential only — the language-preference cookie
 * (`NEXT_LOCALE`) and the consent-choice cookie (`glh-consent`, Story 5.2). No
 * analytics, no non-essential tracking exists yet. (The admin session cookie is
 * staff-only, never set for a public buyer, so it is out of scope here.)
 *
 * ⚠️ FORWARD DEPENDENCY. When Story 5.8 (analytics) lands, THIS copy and its
 * effective date must gain the analytics category — see `deferred-work.md`. Do
 * not promise analytics here before it ships.
 *
 * Shares the `legalSignals` predicate with `/privacy`, `/terms` and `sitemap.ts`;
 * effective line from `LEGAL_EFFECTIVE`; uniform `force-dynamic`, no DB read.
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
    <LegalDocument title={t("title")} versionLine={t("effective", { date: LEGAL_EFFECTIVE })}>
      <p>{t("intro")}</p>
      <p>{t("essential")}</p>
      <p>{t("noTracking")}</p>
    </LegalDocument>
  );
}
