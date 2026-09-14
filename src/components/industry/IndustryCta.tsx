import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DarkBand, Kicker, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";
import { rfqIndustryHref } from "@/lib/rfq-href";
import { SlaSummary } from "@/components/sla/SlaSummary";
import type { SlaContent } from "@/server/repositories/sla";
import { hasSlaSummary } from "@/lib/sla-content";

/**
 * Closing CTA band (Story 2.1) — the last beat of EXPERIENCE.md's industry stack.
 *
 * Full-bleed `ink`: DESIGN.md reserves dark bands for the credibility and
 * conversion beats, and the fill+fixed two-column (CTA button column 320) is the
 * canonical way to put the actions on the right edge.
 *
 * The co-equal phone is not optional here — EXPERIENCE.md § Interaction Primitives
 * makes it a first-class action "everywhere the RFQ CTA appears" (FR31). Both CTAs
 * use the `onDark*` variants; a navy button on the ink band is an explicit DON'T.
 *
 * The SLA numbers are identical to every other surface that promises them, which is
 * why they lived in `messages` rather than being written per page — until Story
 * 3.5 moved them into the content model, so an admin can revise them without a
 * deploy (FR30). The consistency argument is unchanged; only the source moved.
 */
export function IndustryCta({
  industryName,
  industrySlug,
  sla,
  isFallback = false,
}: {
  industryName: string;
  /** The response process (Story 3.5); `null` only when unseeded. */
  sla: SlaContent | null;
  /** ⚠️ ADDED BY STORY 3.4. This component received only the NAME, so it could
   *  not build its own doorway href — the single reason this CTA was more than
   *  a one-line edit while its sibling IndustryHero already carried the slug. */
  industrySlug: string;
  /**
   * The sector name is interpolated into a heading, so it needs the same honest
   * marking every other rendering of it gets: without this, an untranslated English
   * name landed unmarked inside a Russian h2 (FR34a / AC6).
   */
  isFallback?: boolean;
}) {
  const t = useTranslations("Industry");
  const tNav = useTranslations("Nav");

  return (
    <DarkBand>
      <div className={`${CONTAINER} py-14 md:py-16`}>
        <TwoColumn
          sideWidth={320}
          main={
            <div>
              <Kicker>{t("ctaKicker")}</Kicker>
              <h2
                className="mt-3 font-heading text-2xl font-bold tracking-tight text-white md:text-[28px]"
                // The whole heading carries the marking, because the fallen-back
                // fragment is interpolated INSIDE the sentence and cannot be wrapped
                // separately without breaking the per-locale word order.
                lang={isFallback ? "en" : undefined}
              >
                {/* The sector name is interpolated, not concatenated: word order
                    around it differs across EN/TR/RU. */}
                {t("ctaTitle", { industry: industryName })}
              </h2>
              <p className="mt-4 max-w-[62ch] leading-relaxed text-on-dark-text">{t("ctaLead")}</p>
              {/* From the content model since Story 3.5 — one source, eight
                  surfaces, one revalidate. Conditional because an unseeded model
                  must leave no empty line in the band. */}
              {hasSlaSummary(sla) && (
                <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
                  <SlaSummary sla={sla} tone="onDark" />
                </p>
              )}
            </div>
          }
          side={
            <div className="flex flex-col gap-3">
              <Link
                href={rfqIndustryHref(industrySlug)}
                className={buttonClasses("onDarkPrimary", "w-full text-center")}
              >
                {tNav("requestQuote")}
              </Link>
              <a
                href={`tel:${SITE.phone}`}
                aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
                className={buttonClasses("onDarkSecondary", "min-h-11 w-full gap-2 font-data")}
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
