import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { DarkBand, Kicker, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";

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
 * why they live in `messages` rather than being written per page.
 */
export function IndustryCta({ industryName }: { industryName: string }) {
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
              <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white md:text-[28px]">
                {/* The sector name is interpolated, not concatenated: word order
                    around it differs across EN/TR/RU. */}
                {t("ctaTitle", { industry: industryName })}
              </h2>
              <p className="mt-4 max-w-[62ch] leading-relaxed text-on-dark-text">{t("ctaLead")}</p>
              <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
                {t("sla")}
              </p>
            </div>
          }
          side={
            <div className="flex flex-col gap-3">
              <Link
                href={SITE.rfqHref}
                className={buttonClasses("onDarkPrimary", "w-full text-center")}
              >
                {tNav("requestQuote")}
              </Link>
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
