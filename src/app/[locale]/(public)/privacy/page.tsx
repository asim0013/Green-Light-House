import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { legalSignals } from "@/server/legal-page";
import { PRIVACY_POLICY_VERSION } from "@/server/rfq/schema";
import { LegalDocument } from "@/components/legal/LegalDocument";

/**
 * `/privacy` — the privacy policy (Story 5.1 — FR43). Replaced the Story 3.2
 * noindex stub with the real data-use policy.
 *
 * - The version token is LOAD-BEARING: `POST /api/rfq` stamps
 *   `Lead.consentVersion` with it (plus the UI locale), so FR44's "which policy
 *   text was shown" has an honest answer. It is ONE shared constant —
 *   `PRIVACY_POLICY_VERSION` in `@/server/rfq/schema` — consumed here and by the
 *   route, so the two cannot drift; any wording change to `Legal.privacy` must
 *   bump that constant (its docstring carries the rule and the r2/r3/r4/v1 log).
 * - Indexability via `legalSignals` — the ONE predicate shared by this page's
 *   robots, `/terms`, `/cookies` and `sitemap.ts`. `noindex` + absent from the
 *   sitemap until BOTH human review gates (`LEGAL.approvals`) are set, then
 *   self-lifting with no code change. `follow` stays true (robotsFor), so the
 *   policy's links out are still crawled.
 * - Data-subject requests route to `/contact` (footer-linked on every page), NOT
 *   to a phone number — see `Legal.privacy.rights`.
 *
 * No DB read — content is entirely messages-driven — but the route keeps the
 * uniform `force-dynamic` skeleton (a `generateStaticParams` here would be the
 * one non-dynamic public page, and uniformity is what the build gate rests on).
 */
export const dynamic = "force-dynamic";

/** What `Lead.consentVersion` is minted from — see the docstring. */
const POLICY_VERSION = PRIVACY_POLICY_VERSION;

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Legal.privacy" });

  return {
    title: t("title"),
    alternates: alternatesFor(locale, "/privacy"),
    robots: robotsFor(legalSignals(locale)),
  };
}

export default async function PrivacyPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Legal.privacy" });

  return (
    <LegalDocument title={t("title")} versionLine={t("version", { version: POLICY_VERSION })}>
      <p>{t("intro")}</p>
      <p>{t("collect")}</p>
      <p>{t("use")}</p>
      <p>{t("retention")}</p>
      <p>{t("rights")}</p>
    </LegalDocument>
  );
}
