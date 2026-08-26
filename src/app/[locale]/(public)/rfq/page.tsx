import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { rfqSignals } from "@/server/rfq-page";
import { listIndustries } from "@/server/repositories/industry";
import { TwoColumn } from "@/components/ui";
import { RfqForm } from "@/components/rfq/RfqForm";
import { RfqRail } from "@/components/rfq/RfqRail";
import { CONTAINER } from "@/components/layout/container";

/**
 * SSR per request — the industry select reads the live PID (FR4: "never a
 * hard-coded option list"), so this must never be baked into the static build.
 *
 * NO `generateStaticParams`, deliberately. Next executes `buildAppStaticPaths`
 * for any route with dynamic segments with no `dynamic` check, so a DB-reading
 * one would break the Postgres-free build even under `force-dynamic`. A warm
 * Redis MASKS that failure (measured in 2.1) — `npm run cache:flush` before
 * proving the build gate.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Rfq" });

  return {
    title: t("title"),
    description: t("lead"),
    alternates: alternatesFor(locale, "/rfq"),
    // Shared with sitemap.ts (one predicate per surface): constant-indexable in
    // all three locales — see `rfqSignals` for why this page cannot be thin.
    robots: robotsFor(rfqSignals(locale)),
  };
}

/**
 * The RFQ page (Story 3.2 — FR27/FR4; UJ2's closing beat).
 *
 * THE ONE PAGE BUILT WHITE-CARDS-ON-GREY: the canvas deliberately inverts the
 * ground to `surface-2` so the two form cards and the rail cards read as
 * work-surfaces. The `border-muted` control border passes 1.4.11 only against
 * the cards' white fill — the inversion is why controls must never sit on the
 * page ground directly (see `FormSectionCard`).
 *
 * NO BREADCRUMB, deliberately — a recorded reconciliation verdict, not an
 * omission: this is a conversion endpoint, not a browse location; the way back
 * is the nav.
 *
 * NO `searchParams`, MORE deliberately (AC8 — the Story 3.4 seam): this page
 * accepts ANY query string by reading NONE of it. `?project=` and the rest of
 * the frozen `PREFILL_PARAMS` are 3.4's to read; until then no query value can
 * reach a code path, which is also what makes the 2.5 hostile-query 500 class
 * (NUL bytes, split surrogates) structurally impossible here rather than
 * merely handled. The e2e proves the 200 against the worst two inputs.
 *
 * The form island receives everything it needs as props (industries resolved
 * server-side, the UI locale) because Story 3.8 mounts the same island on
 * `/contact` — the page owns the reads, the island owns the behavior.
 */
export default async function RfqPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // Self-validate the segment rather than relying on the layout's guard order
  // (the App Router renders layout and page concurrently).
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const industries = await listIndustries(locale);
  const t = await getTranslations({ locale, namespace: "Rfq" });

  return (
    <div className="bg-surface-2">
      <div className={`${CONTAINER} pb-12 pt-8 md:pb-16 md:pt-10`}>
        <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
          {t("title")}
        </h1>
        <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">{t("lead")}</p>

        {/* The canvas's 44px column gap: `TwoColumn` hard-codes `gap-5`, and the
            responsive `lg:gap-11` wins at the breakpoint where the columns
            actually sit side by side (stacked keeps the tighter gap). */}
        <TwoColumn
          className="mt-8 lg:gap-11"
          main={
            <RfqForm
              industries={industries.map(({ slug, name, isFallback }) => ({
                slug,
                name,
                isFallback,
              }))}
              uiLocale={locale}
            />
          }
          side={<RfqRail />}
        />
      </div>
    </div>
  );
}
