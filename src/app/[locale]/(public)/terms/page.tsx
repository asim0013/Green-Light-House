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
 * `/terms` — terms of use (Story 5.1 — FR43). Plain B2B terms; drafted pending
 * qualified legal review, which the `legalReviewed` gate (via `legalSignals`)
 * holds out of the index until it is set.
 *
 * Shares the `legalSignals` predicate with `/privacy`, `/cookies` and
 * `sitemap.ts` — one review lifts all three together, and robots can never
 * disagree with the sitemap (FR42a). The effective-period line comes from
 * `LEGAL_EFFECTIVE`, NOT the consent stamp (terms carry no consent relationship).
 * No DB read; uniform `force-dynamic` skeleton like every public page.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Legal.terms" });

  return {
    title: t("title"),
    alternates: alternatesFor(locale, "/terms"),
    robots: robotsFor(legalSignals(locale)),
  };
}

export default async function TermsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Legal.terms" });

  return (
    <LegalDocument title={t("title")} versionLine={t("effective", { date: LEGAL_EFFECTIVE })}>
      <p>{t("intro")}</p>
      <p>{t("content")}</p>
      <p>{t("ip")}</p>
      <p>{t("liability")}</p>
      <p>{t("law")}</p>
      <p>{t("contact")}</p>
    </LegalDocument>
  );
}
