import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { contactSignals } from "@/server/contact-page";
import { getSlaContent } from "@/server/repositories/sla";
import { listIndustries } from "@/server/repositories/industry";
import { hasSlaSummary } from "@/lib/sla-content";
import { SlaSummary } from "@/components/sla/SlaSummary";
import { RfqForm } from "@/components/rfq/RfqForm";
import { TalkCard } from "@/components/rfq/TalkCard";
import { Breadcrumb, Kicker, TwoColumn } from "@/components/ui";
import { CONTAINER } from "@/components/layout/container";
import {
  CONTACT,
  configuredChannels,
  reachChannels,
  suppliedValue,
  mapsUrl,
} from "@/config/contact";

/**
 * SSR per request — reads live DB content (the industry list and the SLA), so it
 * must never be baked into the static build.
 *
 * NO `generateStaticParams`, deliberately. Next executes `buildAppStaticPaths`
 * for any route with dynamic segments — `/[locale]/contact` qualifies — with no
 * `dynamic` check, so a DB-reading one would break the Postgres-free build even
 * under `force-dynamic`. ⚠️ A warm Redis MASKS that failure (measured in 2.1),
 * which is why CI blanks `REDIS_URL` for the build step.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Contact" });

  // ⚠️ THE DESCRIPTION MUST NOT ADVERTISE A CHANNEL THE PAGE DOES NOT HAVE.
  // `metaDescription` names an email AND a postal address; it shipped
  // unconditionally, so every request in all three locales promised a search
  // engine two channels the page could not show — the exact thing the page
  // docstring says it never does. The condition is the claim: this key renders
  // only when both of the channels it names are configured.
  const channels = configuredChannels();
  const describesEmailAndAddress = channels.includes("email") && channels.includes("address");

  return {
    title: t("title"),
    description: t(describesEmailAndAddress ? "metaDescription" : "metaDescriptionMinimal"),
    alternates: alternatesFor(locale, "/contact"),
    // Shared with sitemap.ts so the page's robots tag and the sitemap's
    // inclusion rule can never disagree about this URL (FR42a).
    robots: robotsFor(contactSignals(locale)),
  };
}

/**
 * The Contact page (Story 3.8 — FR33; UX-DR19, UX-DR21).
 *
 * ⚠️ BUILT FROM THE SPINES, AND THE ABSENCE OF A MOCK IS VERIFIED, NOT ASSUMED.
 * The recovered Pencil canvas holds eight frames and Contact is not one of them;
 * the word "Contact" appears exactly once in the whole design record, as a
 * footer LINK label. Unlike `/services` — the structural template this copies —
 * /contact is not even marked ○ in EXPERIENCE.md's sitemap. It is justified by
 * FR33 and the surface-closure rule, and nothing else.
 *
 * ⚠️ IT SHIPS BEFORE ITS CONTENT, DELIBERATELY. GLH has supplied no address, no
 * inquiry email and no registration details. Rather than block the route, the
 * page renders ONLY the channels that are configured and declares itself a
 * placeholder until the required set is complete — so it is `noindex` and absent
 * from the sitemap, and never advertises an address it does not have.
 *
 * ⛔ AND PUBLISHING IT IS NOT A VALUES-ONLY EDIT, THOUGH THIS DOCSTRING USED TO
 * SAY IT WAS. The 3.8 review measured the old behaviour live: filling five
 * fields in `src/config/contact.ts` flipped all three locales to `index, follow`
 * and into `sitemap.xml` on the next deploy, silently routing past two written
 * pre-launch obligations — qualified legal review of the реквизиты
 * (`prd.md:186`, DP-10/OQ7) and native review of the machine-drafted TR/RU copy
 * (`owner-actions.md` §3(b)). Both are now `CONTACT.approvals` booleans:
 * `legalReviewed` gates the legal block's RENDER (a `noindex` page is still
 * public, so `noindex` withholds a disclosure from nobody) and
 * `translationsReviewed` gates INDEXING, which is where its own source puts it.
 *
 * NO CLOSING `DarkBand` CTA, which departs from the `/services` skeleton on
 * purpose: every other surface terminates at the RFQ or the phone because those
 * live elsewhere. Here they ARE the page — a band beneath the inquiry form
 * inviting the reader to make an inquiry would be noise.
 *
 * ⚠️ THE PHONE IS CHROME. `TalkCard` renders `SITE.phone`'s placeholder exactly
 * as the header, the hero, every industry page and the 404 already do. It is
 * exempt from the configured-channels rule: hiding it here alone would be the
 * inconsistency, not the fix.
 */
export default async function ContactPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  // Self-validate the segment rather than relying on the layout's guard order
  // (the App Router renders layout and page concurrently), and narrow `locale` to
  // the routing union the repositories accept.
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [sla, industries] = await Promise.all([getSlaContent(locale), listIndustries(locale)]);
  const t = await getTranslations({ locale, namespace: "Contact" });
  const tNav = await getTranslations({ locale, namespace: "Nav" });

  // ⚠️ ONE PREDICATE, NARROWED ONCE. Each row used to re-derive its own
  // `isSupplied(CONTACT.…)` beside this call, so `configuredChannels` described
  // what renders while the JSX independently decided it — two implementations of
  // one rule, free to drift. They now cannot: `configuredChannels` decides, and
  // the `isSupplied` half of each line below exists only to narrow
  // `string | null` to `string` for TypeScript. The difference is load-bearing
  // for the legal block, which `configuredChannels` withholds until
  // `approvals.legalReviewed` regardless of how complete its values are.
  const channels = configuredChannels();
  const hasChannels = channels.length > 0;
  const email = channels.includes("email") ? suppliedValue(CONTACT.email) : null;
  const address = channels.includes("address") ? suppliedValue(CONTACT.address) : null;
  const legal = channels.includes("legal") ? CONTACT.legal : null;
  // ⚠️ THE SECTION KICKER FOLLOWS THE REACH CHANNELS, NOT THE ZONE. With only
  // the registered name supplied, "Ways to reach us" would head a block that
  // offers no way to reach anyone. The block still renders — it is a disclosure
  // GLH supplied — and its own "Company details" label describes it correctly.
  const hasReachChannels = reachChannels().length > 0;

  return (
    <>
      {/* Single crumb, matching `/services` and the `/industries` index: this is
          a top-level signpost, not a nested view. */}
      <Breadcrumb items={[{ label: tNav("contact") }]} />

      <section className="bg-surface-2">
        <div className={`${CONTAINER} pb-8 pt-6 md:pb-10`}>
          {/* No kicker above the h1, unlike `/services`: `channelsKicker` names
              the CHANNELS BLOCK and belongs inside that block's conditional
              region (below), not over the page title. Borrowing it here would
              label the whole page "Ways to reach us" and leave the block that
              actually is those ways unheaded. */}
          <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            {t("title")}
          </h1>
          {/* ⚠️ SAME RULE AS THE META DESCRIPTION. `lead` offers the reader an
              email ("by phone, by email, or by sending the project straight
              through") and shipped unconditionally, so the page invited buyers
              in three languages to use a mailbox it does not publish. The
              minimal variant names only what is actually on the page. */}
          <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
            {t(channels.includes("email") ? "lead" : "leadMinimal")}
          </p>
        </div>
      </section>

      <section className="bg-surface">
        <div className={`${CONTAINER} py-10 md:py-12`}>
          <TwoColumn
            className="lg:gap-11"
            main={
              <div>
                {/* ⚠️ THE WHOLE ZONE IS CONDITIONAL, HEADING INCLUDED. With no
                    channel configured a bare "Ways to reach us" above emptiness
                    is the "border draws above nothing" defect the 3.5 review
                    found on six surfaces. */}
                {hasChannels && (
                  <div className="border-b border-border-subtle pb-8">
                    {hasReachChannels && <Kicker tone="ink">{t("channelsKicker")}</Kicker>}
                    <dl className="mt-4 flex flex-col gap-5">
                      {email && (
                        <div>
                          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
                            {t("emailLabel")}
                          </dt>
                          <dd className="mt-1.5">
                            {/* `translate="no"` for the same reason the address
                              and the phone number carry it: a mailbox is machine
                              data, and a browser that "helpfully" translates the
                              local part produces an address that does not
                              deliver. This was the ONE machine value shipped
                              without it. */}
                            <a
                              href={`mailto:${email}`}
                              translate="no"
                              className="font-data text-[15px] text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                            >
                              {email}
                            </a>
                          </dd>
                        </div>
                      )}

                      {address && (
                        <div>
                          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
                            {t("addressLabel")}
                          </dt>
                          {/* The address is machine data, not prose: `translate="no"`
                            for the same reason the phone number carries it. */}
                          <dd
                            className="mt-1.5 whitespace-pre-line text-[15px] leading-relaxed text-ink"
                            translate="no"
                          >
                            {address}
                          </dd>
                          <dd className="mt-2">
                            {/* ⚠️ AN ORDINARY OUTBOUND LINK, NOT AN EMBED (FR46).
                              A map iframe, script or tile fetch would set
                              third-party cookies before consent — Story 5.2's
                              territory. Nothing loads from Google unless the
                              reader clicks and leaves. The URL is DERIVED from
                              the address so the two cannot drift. */}
                            {/* ⚠️ THE ONE `target="_blank"` IN THE CODEBASE, SO
                              IT CARRIES THE AFFORDANCE THE REST OF THE SITE
                              NEVER HAD TO. Opening a new tab with no warning is
                              a WCAG 3.2.5 surprise; the visually-hidden suffix
                              is what a screen reader announces, and the `title`
                              is what a sighted mouse user gets. Both say the
                              same thing, from one key. */}
                            <a
                              href={mapsUrl(address)}
                              target="_blank"
                              rel="noopener noreferrer"
                              title={t("opensInNewTab")}
                              className="font-mono text-[12px] uppercase tracking-[0.12em] text-accent hover:underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                            >
                              {t("mapsCta")}
                              <span className="sr-only"> ({t("opensInNewTab")})</span>
                            </a>
                          </dd>
                        </div>
                      )}

                      {legal && (
                        <div>
                          <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
                            {t("legalKicker")}
                          </dt>
                          <dd className="mt-1.5 flex flex-col gap-1 text-[14px] text-ink-2">
                            {/* Each number renders only if supplied — a partially
                              filled legal block shows what it has, never a
                              label with nothing beside it. */}
                            <LegalRow label={t("legalName")} value={legal.legalName} />
                            <LegalRow label={t("tradeRegistryNo")} value={legal.tradeRegistryNo} />
                            <LegalRow label={t("taxOffice")} value={legal.taxOffice} />
                            <LegalRow label={t("taxNo")} value={legal.taxNo} />
                            <LegalRow label={t("mersisNo")} value={legal.mersisNo} />
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )}

                <div className={hasChannels ? "mt-8" : undefined}>
                  <Kicker tone="ink">{t("formKicker")}</Kicker>
                  <div className="mt-4">
                    <RfqForm
                      // ⚠️ THE `.map()` IS LOAD-BEARING, NOT TIDINESS.
                      // `IndustryListItem` is `RfqIndustryOption` PLUS `id` and
                      // `description`, so `industries={industries}` compiles —
                      // TypeScript's excess-property check does not apply to a
                      // variable — and silently ships both extra fields into the
                      // client payload of a `"use client"` island.
                      industries={industries.map(({ slug, name, isFallback }) => ({
                        slug,
                        name,
                        isFallback,
                      }))}
                      uiLocale={locale}
                      // ⚠️ NO `prefill`, AND THAT IS A DECISION. /contact carries
                      // no doorway params, and omitting it is what makes the lead
                      // record `source = "direct"` — the epics' AC delivered with
                      // zero code.
                      //
                      // ⚠️ AND `sla` IS THE REAL VALUE. `sla={null}` typechecks
                      // and would silently drop the stepper from the submitted
                      // confirmation; `RfqForm`'s own docstring names this story
                      // as the one most likely to do it.
                      sla={sla}
                    />
                  </div>
                </div>
              </div>
            }
            side={
              <div className="flex flex-col gap-5">
                {/* The SAME component `/rfq` mounts — one card, two pages. */}
                <TalkCard />

                {hasSlaSummary(sla) && (
                  <p className="px-1 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-ink-2">
                    {/* `SlaSummary` renders NO wrapper — each caller supplies its
                        own `<p>`. `tone="light"`: this column sits on `surface`,
                        where FallbackNotice's dark token would be white on white. */}
                    <SlaSummary sla={sla} tone="light" />
                  </p>
                )}
              </div>
            }
          />
        </div>
      </section>
    </>
  );
}

/** One legal row, rendered only when its value is supplied. */
function LegalRow({ label, value }: { label: string; value: string | null }) {
  // Same accessor as the channels above: this decided on the TRIMMED value and
  // rendered the RAW one, so a pasted registration number with a trailing space
  // shipped that space into a `font-data` span.
  const supplied = suppliedValue(value);
  if (supplied === null) return null;
  return (
    <span className="flex flex-wrap gap-x-2">
      <span className="text-ink-2">{label}:</span>
      <span className="font-data text-ink" translate="no">
        {supplied}
      </span>
    </span>
  );
}
