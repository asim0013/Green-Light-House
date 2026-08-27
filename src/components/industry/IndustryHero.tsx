import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DarkBand, Kicker, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";
import { rfqIndustryHref } from "@/lib/rfq-href";
import type { IndustryDetail } from "@/server/repositories/industry";

/**
 * Sector hero (Story 2.1) — EXPERIENCE.md § IA names it as the first beat of the
 * industry landing page.
 *
 * DARK ON PURPOSE. DESIGN.md § Colors documents `on-dark-panel` as "a raised panel
 * on a dark band, e.g. the industry 'Typical applications' list", which only makes
 * sense if this hero is an `ink` band — and DESIGN.md's `display` type step (40–46)
 * is annotated "industry/project hero". So industry pages read differently from the
 * light catalog and product surfaces.
 *
 * WHY THE SIDE COLUMN IS THE CONVERSION ANCHOR, NOT "TYPICAL APPLICATIONS".
 * DESIGN.md names a fixed-420 "Typical applications" panel here, but there is NO
 * data for it: `Industry` carries a slug and a translated name/description and
 * nothing else — no applications, no standards list. Rendering an empty box would
 * violate "don't wrap every element in its own box", and inventing the content
 * would put untranslatable copy on a public page. So the 420 column holds what
 * EXPERIENCE.md § Component Patterns calls "the persistent conversion anchor" —
 * the RFQ CTA plus the co-equal phone (FR31) — which is real, required, and matches
 * the homepage's above-the-fold pattern. A "typical applications" content model is
 * recorded as deferred work.
 *
 * Server Component: no client JS on the page's LCP surface, which is why the CTAs
 * are `buttonClasses` on links rather than the `"use client"` <Button>.
 */
export function IndustryHero({ industry }: { industry: IndustryDetail }) {
  const t = useTranslations("Industry");
  const tNav = useTranslations("Nav");
  const lang = industry.isFallback ? "en" : undefined;

  return (
    <DarkBand>
      <div className={`${CONTAINER} py-14 md:py-20`}>
        <TwoColumn
          sideWidth={420}
          main={
            <div>
              {/* Default `accent` tone — accent-soft is 4.68:1 on ink, the one
                  surface where an 11px kicker clears AA. */}
              <Kicker>{tNav("industries")}</Kicker>

              {/* DESIGN.md's `display` step (40–46), stepped down at narrow widths
                  for the same reason as the homepage hero: Russian sector names are
                  long and overflow a 320px column at full size. */}
              {/* The notice sits INSIDE the h1, as it does at every other call site.
                  Outside it, it rendered as an orphan line and was absent from the
                  heading's accessible name. `onDark` because this is an ink band —
                  the default light token measures 2.96:1 here. */}
              <h1 className="mt-3 font-heading text-[28px] font-bold leading-[1.1] tracking-tight text-white sm:text-[36px] md:text-[46px]">
                <span lang={lang}>{industry.name}</span>
                <FallbackNotice isFallback={industry.isFallback} tone="onDark" />
              </h1>

              {industry.description && (
                <p
                  lang={lang}
                  className="mt-5 max-w-[52ch] text-[17px] leading-relaxed text-on-dark-text"
                >
                  {industry.description}
                </p>
              )}

              <p className="mt-8 border-t border-on-dark-border pt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
                {t("sla")}
              </p>
            </div>
          }
          side={
            <div className="flex flex-col gap-3 bg-on-dark-panel p-6">
              <p className="font-heading text-lg font-semibold leading-snug text-white">
                {t("anchorTitle")}
              </p>
              <p className="text-sm leading-relaxed text-on-dark-text">{t("anchorNoPrices")}</p>
              <Link
                href={rfqIndustryHref(industry.slug)}
                className={buttonClasses("onDarkPrimary", "mt-2 w-full text-center")}
              >
                {tNav("requestQuote")}
              </Link>
              {/* Co-equal phone (FR31 / EXPERIENCE.md § Interaction Primitives:
                  "everywhere the RFQ CTA appears"). Never a navy button on ink. */}
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
  );
}
