import { cache } from "react";
import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { industriesIndexSignals } from "@/server/industry-page";
import { listIndustries } from "@/server/repositories/industry";
import { Link } from "@/i18n/navigation";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { Kicker } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";

// Same constraint as the slug route: reads the database, so it must not be
// prerendered, and it exports no `generateStaticParams` (there are no dynamic
// segments here, but the build-time DB rule is the same).
export const dynamic = "force-dynamic";

/** Request-scoped memo — `generateMetadata` and the body both read the list. */
const getIndustries = cache(async (locale: (typeof routing.locales)[number]) =>
  listIndustries(locale),
);

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const industries = await getIndustries(locale);
  const t = await getTranslations({ locale, namespace: "Industry" });

  return {
    title: t("indexTitle"),
    description: t("indexLead"),
    alternates: alternatesFor(locale, "/industries"),
    // Shared with sitemap.ts so the page's robots tag and the sitemap's inclusion
    // rule can never disagree about this URL.
    robots: robotsFor(industriesIndexSignals(locale, industries)),
  };
}

/**
 * The `/industries` index (Story 2.1, AC3).
 *
 * DELIBERATELY MINIMAL. No source specifies this surface: EXPERIENCE.md's sitemap
 * names "Industries → Industry landing" but marks only the LANDING page as designed
 * this cycle, and the architecture's route inventory lists `industries/[slug]` and
 * no bare index. So this is a signpost built from existing primitives, not a new
 * visual language — it exists because `/industries` is in `NAV_ITEMS` and every
 * page links to it, which until now resolved to a 404.
 */
export default async function IndustriesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const industries = await getIndustries(locale);
  const t = await getTranslations({ locale, namespace: "Industry" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  return (
    <>
      <Breadcrumb items={[{ label: tNav("industries") }]} />

      <section className="bg-surface">
        <div className={`${CONTAINER} py-12 md:py-16`}>
          <Kicker tone="ink">{tNav("industries")}</Kicker>
          <h1 className="mt-3 font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            {t("indexTitle")}
          </h1>
          <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
            {t("indexLead")}
          </p>

          {industries.length === 0 ? (
            <p className="mt-8 max-w-[62ch] leading-relaxed text-ink-2">{t("indexEmpty")}</p>
          ) : (
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {industries.map((industry) => (
                <li key={industry.id}>
                  <Link
                    href={`/industries/${industry.slug}`}
                    className="flex h-full flex-col border border-border-subtle bg-surface p-5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    <span className="font-heading text-base font-semibold text-ink">
                      <span lang={industry.isFallback ? "en" : undefined}>{industry.name}</span>
                      <FallbackNotice isFallback={industry.isFallback} />
                    </span>
                    {industry.description && (
                      <span
                        lang={industry.isFallback ? "en" : undefined}
                        className="mt-2 leading-relaxed text-ink-2"
                      >
                        {industry.description}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
