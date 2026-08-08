import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { listIndustries } from "@/server/repositories/industry";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { Kicker, SectionHeader, Button, Chip, DarkBand, TwoColumn } from "@/components/ui";

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
    <main className="mx-auto w-full max-w-[1240px] flex-1 px-6 py-16">
      <Kicker>GREENLIGHTHOUSE</Kicker>
      <h1 className="mt-2 font-heading text-3xl font-bold tracking-tight text-ink md:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-2 text-ink-2">{t("subtitle")}</p>

      <ul className="mt-8 border-t border-border-subtle">
        {industries.map((industry) => (
          <li key={industry.id} className="border-b border-border-subtle py-3 font-body text-ink">
            {/* Mark the fallen-back English content with lang="en" (AC4). */}
            <span lang={industry.isFallback ? "en" : undefined}>{industry.name}</span>
            <FallbackNotice isFallback={industry.isFallback} />
          </li>
        ))}
      </ul>

      {/*
        Primitive showcase (Story 1.5) — TEMPORARY, non-localized demo content so
        each base primitive is exercised at least once. Real pages (1.6 nav, 1.7
        homepage) compose these with next-intl copy and replace this scaffold.
      */}
      <section className="mt-16">
        <SectionHeader
          kicker="Design system"
          title="Primitives in use"
          sub="Temporary showcase — tokens, typography, and base components."
          action={<Button variant="link">View components</Button>}
        />
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary action</Button>
          <Button variant="secondary">Secondary</Button>
          <Chip>ATEX Zone 1</Chip>
          <Chip variant="outline" cert>
            ISO 9001
          </Chip>
        </div>
      </section>

      <DarkBand className="mt-8 px-8 py-10">
        <TwoColumn
          sideWidth={220}
          main={
            <div>
              <Kicker>Delivered</Kicker>
              <p className="mt-2 font-heading text-2xl font-bold text-white">Proof over promise.</p>
              <p className="mt-2 text-on-dark-text">
                Ink band using the fill-container main + fixed-width side pattern.
              </p>
            </div>
          }
          side={
            <div className="flex flex-col gap-2">
              <Button variant="onDarkPrimary">Get a quote</Button>
              <Button variant="onDarkSecondary">Call us</Button>
            </div>
          }
        />
      </DarkBand>
    </main>
  );
}
