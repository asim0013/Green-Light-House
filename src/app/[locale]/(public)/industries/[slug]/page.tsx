import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { getIndustryPageData, industrySignals, industryHref } from "@/server/industry-page";
import { Breadcrumb } from "@/components/ui/Breadcrumb";
import { IndustryHero } from "@/components/industry/IndustryHero";
import { IndustryCta } from "@/components/industry/IndustryCta";
import { IndustryNotFound } from "@/components/industry/IndustryNotFound";
import {
  IndustrySupplies,
  IndustryCertificates,
  IndustryServices,
  IndustryProducts,
  IndustryProjects,
} from "@/components/industry/IndustryBlocks";

/**
 * SSR per request — this reads live DB content, so it must not be baked into the
 * static build (a build must never require a running Postgres). Tag-based ISR
 * caching layers onto the same read path via Story 1.8's `cached()`.
 */
export const dynamic = "force-dynamic";

/**
 * THERE IS DELIBERATELY NO `generateStaticParams` HERE, and `force-dynamic` above
 * is NOT what makes that safe.
 *
 * Next's build executes `buildAppStaticPaths` for ANY route with dynamic segments,
 * with no `dynamic` check — it skips only segments that do not export the function.
 * So a database-reading `generateStaticParams` would break the Postgres-free build
 * even with `force-dynamic` set. Omitting it is REQUIRED, not a style choice;
 * together the two are sufficient, and nothing here is prerendered.
 */

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  // `params` is a Promise in the page and in generateMetadata (Next 16). Typed
  // inline rather than with `PageProps<'/[locale]/industries/[slug]'>`, which does
  // not typecheck until a build has regenerated `.next/types`.
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const data = await getIndustryPageData(slug, locale);
  const t = await getTranslations({ locale, namespace: "Industry" });

  if (!data) {
    // A slug that resolves to nothing must never be indexed. Next injects `noindex`
    // automatically for a real 404 STATUS; this page deliberately returns 200 (see
    // IndustryNotFound for the measurements), so it must say so itself. No
    // canonical or hreflang either — they would advertise a page that isn't there.
    return { title: t("notFoundTitle"), robots: { index: false, follow: true } };
  }

  return {
    title: data.industry.name,
    description: data.industry.description ?? undefined,
    // Same helper the sitemap uses, so canonical and sitemap can never disagree.
    alternates: alternatesFor(locale, industryHref(slug)),
    robots: robotsFor(industrySignals(locale, data)),
  };
}

/**
 * Industry landing page (Story 2.1 — FR11, FR12; UJ3).
 *
 * The section order is EXPERIENCE.md § IA's: "sector hero, equipment categories,
 * applicable standards, services, featured products, projects, CTA". The route owns
 * the reads; every section is presentational and renders correctly with zero rows.
 */
export default async function IndustryPage(props: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await props.params;
  // Self-validate the segment rather than relying on the layout's guard order (App
  // Router renders layout and page concurrently). This also narrows `locale` to the
  // routing union, which is what the repositories' Prisma enum accepts.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Establish the request locale for this subtree so the sections' `useTranslations`
  // resolves without threading the locale through every component.
  setRequestLocale(locale);

  const data = await getIndustryPageData(slug, locale);
  const t = await getTranslations({ locale, namespace: "Industry" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  if (!data) {
    return (
      <>
        <Breadcrumb
          items={[
            { label: tNav("industries"), href: "/industries" },
            { label: t("notFoundCrumb") },
          ]}
        />
        <IndustryNotFound />
      </>
    );
  }

  const { industry, categories, certificates, services, products, projects } = data;

  return (
    <>
      <Breadcrumb
        items={[
          { label: tNav("industries"), href: "/industries" },
          { label: industry.name, isFallback: industry.isFallback },
        ]}
      />
      <IndustryHero industry={industry} />
      <IndustrySupplies categories={categories} />
      <IndustryCertificates certificates={certificates} />
      <IndustryServices services={services} />
      <IndustryProducts products={products} />
      <IndustryProjects projects={projects} />
      <IndustryCta industryName={industry.name} isFallback={industry.isFallback} />
    </>
  );
}
