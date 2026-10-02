import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { listPublishedGuides } from "@/server/repositories/selection-guide";
import { guidesIndexSignals } from "@/server/guide-page";
import { Link } from "@/i18n/navigation";
import { Breadcrumb } from "@/components/ui";
import { CONTAINER } from "@/components/layout/container";

/**
 * The selection-guides index (Story 4.11 — FR41/FR42/FR42a). Lists PUBLISHED
 * guides. SSR per request (DB read) — `force-dynamic` so the Postgres-free build
 * never executes it. robots/sitemap share `guidesIndexSignals` (one predicate).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};
  const [t, guides] = await Promise.all([
    getTranslations({ locale, namespace: "Guides" }),
    listPublishedGuides(locale),
  ]);
  return {
    title: t("title"),
    description: t("metaDescription"),
    alternates: alternatesFor(locale, "/guides"),
    robots: robotsFor(guidesIndexSignals(locale, guides)),
  };
}

export default async function GuidesIndexPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const [t, guides] = await Promise.all([
    getTranslations({ locale, namespace: "Guides" }),
    listPublishedGuides(locale),
  ]);

  return (
    <>
      <Breadcrumb items={[{ label: t("crumb") }]} />
      <section className="bg-surface-2">
        <div className={`${CONTAINER} pb-8 pt-6 md:pb-10`}>
          <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">{t("lead")}</p>
        </div>
      </section>
      <section className="bg-surface">
        <div className={`${CONTAINER} py-10 md:py-12`}>
          {guides.length === 0 ? (
            <p className="text-[15px] text-ink-2">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border-subtle">
              {guides.map((g) => (
                <li key={g.slug} className="py-5">
                  <Link
                    href={`/guides/${g.slug}`}
                    className="font-heading text-[19px] font-semibold text-ink hover:text-accent underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {g.title}
                  </Link>
                  {g.intro && (
                    <p className="mt-1.5 max-w-[70ch] text-[15px] leading-relaxed text-ink-2">
                      {g.intro}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}
