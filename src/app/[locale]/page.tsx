import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { listIndustries } from "@/server/repositories/industry";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";

// SSR per request — this reads live DB content, so it must not be baked into the
// static build (a build must not require a running Postgres). Real catalog pages
// (Epic 2) will layer tag-based ISR caching on top of the same read path.
export const dynamic = "force-dynamic";

/**
 * TEMPORARY proof surface (Story 1.3).
 *
 * Demonstrates the localization contract end-to-end: locale routing resolves
 * this page per `[locale]`, UI strings come from `messages/*.json`, and seeded
 * industry names are read through the Story 1.2 repository — rendering the EN
 * value with a "shown in English" marker wherever the requested TR/RU value is
 * missing. Story 1.7 replaces this with the real projects-first homepage.
 */
export default async function LocaleHome(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // Self-validate the segment rather than relying on the sibling layout's guard
  // order (App Router renders layout and page concurrently). This also narrows
  // `locale` to the routing union — assignable to the Prisma enum, so no cast.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Locale passed explicitly — no `setRequestLocale` needed on a force-dynamic page.
  const t = await getTranslations({ locale, namespace: "Home" });
  const industries = await listIndustries(locale);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{t("subtitle")}</p>

      <ul className="mt-8 divide-y divide-zinc-200 dark:divide-zinc-800">
        {industries.map((industry) => (
          <li key={industry.id} className="py-3">
            {/* Mark the fallen-back English content with lang="en" (AC4). */}
            <span lang={industry.isFallback ? "en" : undefined}>{industry.name}</span>
            <FallbackNotice isFallback={industry.isFallback} />
          </li>
        ))}
      </ul>
    </main>
  );
}
