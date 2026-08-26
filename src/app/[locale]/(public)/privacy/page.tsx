import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { PRIVACY_POLICY_VERSION } from "@/server/rfq/schema";
import { CONTAINER } from "@/components/layout/container";

/**
 * The `/privacy` STUB (Story 3.2, Task 0 #1 / AC9) — a short, real, versioned
 * data-use page, shipped so the RFQ consent checkbox links to something true.
 *
 * ⚠️ STORY 5.1 REPLACES THIS FILE with the full legal set. Until then:
 *
 * - The version token is LOAD-BEARING: `POST /api/rfq` stamps
 *   `Lead.consentVersion` with it (plus the UI locale), so FR44's "which
 *   policy text was shown" has an honest answer. It is ONE shared constant —
 *   `PRIVACY_POLICY_VERSION` in `@/server/rfq/schema` — consumed here and by
 *   the route, so the two cannot drift; any wording change to the `Legal`
 *   namespace must bump that constant (the 3.2 review's `-r2` bump, adding
 *   `industry`/`timeline` to the disclosure, is the worked example).
 * - `noindex` BY INTENT, and absent from the sitemap: a legal placeholder is
 *   thin content on purpose. The signal is `isPlaceholder` — the honest FR42a
 *   reason — declared inline because both surfaces (this robots tag, the
 *   sitemap's omission) follow from the same fact: a placeholder can never be
 *   indexable, so there is no second predicate to drift from. `follow` stays
 *   true (robotsFor), so the footer links out of here still get crawled.
 *
 * No DB read — the content is entirely messages-driven — but the route keeps
 * the uniform `force-dynamic` skeleton: a `generateStaticParams` here would be
 * the one non-dynamic public page, and uniformity is what the build gate's
 * reasoning rests on.
 */
export const dynamic = "force-dynamic";

/** What `Lead.consentVersion` is minted from — see the docstring. */
const POLICY_VERSION = PRIVACY_POLICY_VERSION;

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Legal" });

  return {
    title: t("title"),
    alternates: alternatesFor(locale, "/privacy"),
    robots: robotsFor({ locale, itemCount: 1, isPlaceholder: true }),
  };
}

export default async function PrivacyPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "Legal" });

  return (
    <div className={`${CONTAINER} max-w-[72ch] py-10 md:py-14`}>
      <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
        {t("title")}
      </h1>
      <p
        className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2"
        translate="no"
      >
        {t("version", { version: POLICY_VERSION })}
      </p>
      <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2">
        <p>{t("intro")}</p>
        <p>{t("collect")}</p>
        <p>{t("use")}</p>
        <p>{t("retention")}</p>
      </div>
    </div>
  );
}
