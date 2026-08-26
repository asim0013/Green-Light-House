import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Phone } from "lucide-react";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { getServicesPageData, servicesSignals } from "@/server/services-page";
import { Link } from "@/i18n/navigation";
import { Breadcrumb, DarkBand, Kicker, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { ServiceList } from "@/components/services/ServiceList";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";

/**
 * SSR per request — reads live DB content, so it must never be baked into the
 * static build.
 *
 * NO `generateStaticParams`, deliberately. Next executes `buildAppStaticPaths`
 * for any route with dynamic segments — `/[locale]/services` qualifies — with no
 * `dynamic` check, so a DB-reading one would break the Postgres-free build even
 * under `force-dynamic`. A warm Redis MASKS that failure (measured in 2.1), which
 * is why CI blanks `REDIS_URL` for the build step.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const services = await getServicesPageData(locale);
  const t = await getTranslations({ locale, namespace: "Services" });

  return {
    title: t("title"),
    description: t("lead"),
    alternates: alternatesFor(locale, "/services"),
    // Shared with sitemap.ts so the page's robots tag and the sitemap's
    // inclusion rule can never disagree about this URL.
    robots: robotsFor(servicesSignals(locale, services)),
  };
}

/**
 * The Services page (Story 2.6 — FR23; the last non-phased Epic 2 surface).
 *
 * BUILT FROM THE SPINES, NOT A MOCK. EXPERIENCE.md marks Services ○ —
 * "spine-only; build from DESIGN.md patterns" — and the Pencil file is gone
 * (verified in 2.1 and again in 2.4). So this composes existing primitives in the
 * established shape: breadcrumb strip → header zone on `surface-2` → the service
 * items on `surface` → closing CTA. No new visual language is invented here.
 *
 * It also closes a chrome-first promise: `/services` has been in `NAV_ITEMS`
 * since Story 1.6 and rendered the localized 404 until now.
 *
 * FR23's five competencies are five rows in the PID (Story 2.6 decision Q1 split
 * the merged `kitting-logistics` seed row), each an editable content item with a
 * translated name and description — "editable" describes the CONTENT MODEL; the
 * admin UI is Epic 4's.
 */
export default async function ServicesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // Self-validate the segment rather than relying on the layout's guard order
  // (the App Router renders layout and page concurrently), and narrow `locale` to
  // the routing union the repositories accept.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const services = await getServicesPageData(locale);
  const t = await getTranslations({ locale, namespace: "Services" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  return (
    <>
      {/* Single crumb, matching the /industries index: this is a top-level
          signpost, not a nested view. */}
      <Breadcrumb items={[{ label: tNav("services") }]} />

      {/* Header zone continues the breadcrumb's surface-2 fill (one zone); the
          body separates by a fill change, so no hairline here — DESIGN.md allows
          a hairline OR a fill change, never both. */}
      <section className="bg-surface-2">
        <div className={`${CONTAINER} pb-8 pt-6 md:pb-10`}>
          <Kicker tone="ink">{t("kicker")}</Kicker>
          <h1 className="mt-3 font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">{t("lead")}</p>
        </div>
      </section>

      <section className="bg-surface">
        <div className={`${CONTAINER} py-10 md:py-12`}>
          {services.length > 0 ? (
            /* h2, not the component default h3: this surface has no SectionHeader
               above the list, so the items ARE the page's second level. At h3 the
               outline read h1 → h3×5 → h2 and put the CTA above the content
               (2.6 review). */
            <ServiceList services={services} headingLevel={2} />
          ) : (
            /* A sparse PID is the launch reality (EXPERIENCE.md § State Patterns).
               With no services this is still a real page with a way onward — the
               CTA below — never a blank region. */
            <p className="max-w-[62ch] leading-relaxed text-ink-2">{t("empty")}</p>
          )}
        </div>
      </section>

      {/* Every surface terminates at the RFQ or the phone (EXPERIENCE.md §
          Surface closure); `/rfq` is live since Story 3.2 (the phased-page
          exception this band shipped under has expired).

          DarkBand + TwoColumn, not a hand-rolled light section (2.6 review).
          DESIGN.md § Elevation reserves the full-bleed `ink` band for stat bands,
          SLA steppers and CLOSING CTAs, and both existing closing CTAs —
          `IndustryCta` and `HomeCredibility` — are built this way. Bypassing the
          primitives would have meant a future change to the closing-CTA treatment
          silently skipping this page, and made this file's own "no new visual
          language is invented here" claim untrue. */}
      <DarkBand>
        <div className={`${CONTAINER} py-14 md:py-16`}>
          <TwoColumn
            sideWidth={320}
            main={
              <div>
                <Kicker>{t("ctaKicker")}</Kicker>
                <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white md:text-[28px]">
                  {t("ctaTitle")}
                </h2>
                <p className="mt-4 max-w-[62ch] leading-relaxed text-on-dark-text">
                  {t("ctaLead")}
                </p>
                {/* The SLA numbers live in `messages` and are identical on every
                    surface that promises them. TR and RU had inlined them into
                    `ctaLead` prose instead — a fourth, uncentralised copy that the
                    next SLA revision would have missed (2.6 review). */}
                <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
                  {t("sla")}
                </p>
              </div>
            }
            side={
              <div className="flex flex-col gap-3">
                <Link
                  href={SITE.rfqHref}
                  className={buttonClasses("onDarkPrimary", "w-full text-center")}
                >
                  {tNav("requestQuote")}
                </Link>
                <a
                  href={`tel:${SITE.phone}`}
                  aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
                  className={buttonClasses("onDarkSecondary", "w-full gap-2 font-data")}
                >
                  <Phone size={16} aria-hidden />
                  {SITE.phoneDisplay}
                </a>
              </div>
            }
          />
        </div>
      </DarkBand>
    </>
  );
}
