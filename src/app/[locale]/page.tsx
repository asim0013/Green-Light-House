import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { listIndustries } from "@/server/repositories/industry";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listTopLevelCategories } from "@/server/repositories/category";
import { listPublishedProjects } from "@/server/repositories/project";
import { HomeHero } from "@/components/home/HomeHero";
import { HomeIndustries } from "@/components/home/HomeIndustries";
import { HomeCategories } from "@/components/home/HomeCategories";
import { HomeManufacturers } from "@/components/home/HomeManufacturers";
import { HomeCredibility } from "@/components/home/HomeCredibility";

// SSR per request — this reads live DB content, so it must not be baked into the
// static build (a build must not require a running Postgres). Tag-based ISR
// caching layers onto this same read path in Story 1.8.
export const dynamic = "force-dynamic";

/**
 * Per-page SEO metadata (Story 1.9 — FR42, FR42a).
 *
 * Canonical and hreflang live HERE rather than in the layout, because they are
 * per-PATH and the layout does not know which child route is rendering.
 *
 * This repeats the page's four reads. That is cheap by construction: every one goes
 * through `cached()` (Story 1.8), so metadata and body share Redis entries rather
 * than hitting Postgres twice — and computing indexability from anything other than
 * the data actually rendered would be guessing.
 */
export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const [projects, industries, categories, manufacturers] = await Promise.all([
    listPublishedProjects(locale, 1),
    listIndustries(locale),
    listTopLevelCategories(locale),
    listManufacturers(locale),
  ]);

  // Every translatable thing the homepage shows. `itemCount === 0` means an empty
  // database, which is genuinely thin; `fallbackFields === totalFields` means not a
  // single row had content in this locale (FR42a's "fallback-only").
  const translated = [...projects, ...industries, ...categories, ...manufacturers];
  const signals = {
    locale,
    itemCount: translated.length,
    fallbackFields: translated.filter((row) => row.isFallback).length,
    totalFields: translated.length,
  };

  return {
    alternates: alternatesFor(locale, "/"),
    robots: robotsFor(signals),
  };
}

/**
 * Projects-first homepage (Story 1.7).
 *
 * Proof → discovery → credibility → inquiry, in that order: the hero leads with a
 * DELIVERED PROJECT rather than a product grid (FR7), the discovery sections carry
 * the industry-led IA (FR8), and the credibility band sits beneath the hero as a
 * validation layer rather than the headline (FR10). Both the Request-Quote CTA and
 * the co-equal phone action appear above the fold and again at the close (FR9).
 *
 * The route owns the data reads; the sections are presentational and take resolved
 * data as props, so each renders correctly with zero rows and stays unit-testable
 * without a database.
 */
export default async function LocaleHome(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // Self-validate the segment rather than relying on the sibling layout's guard
  // order (App Router renders layout and page concurrently). This also narrows
  // `locale` to the routing union — assignable to the Prisma enum, so no cast.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Establish the request locale for this subtree so the sections' `useTranslations`
  // resolves without threading the locale through every component.
  setRequestLocale(locale);

  // Independent reads — issue them together rather than serially.
  const [projects, industries, categories, manufacturers] = await Promise.all([
    listPublishedProjects(locale, 1),
    listIndustries(locale),
    listTopLevelCategories(locale),
    listManufacturers(locale),
  ]);

  return (
    <>
      <HomeHero project={projects[0] ?? null} />
      <HomeIndustries industries={industries} />
      <HomeCategories categories={categories} />
      <HomeManufacturers manufacturers={manufacturers} />
      <HomeCredibility />
    </>
  );
}
