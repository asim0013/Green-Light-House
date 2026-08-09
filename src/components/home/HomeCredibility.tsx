import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Chip, DarkBand, Kicker, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";

/**
 * Credibility + closing conversion band (Story 1.7, FR10).
 *
 * Sits BENEATH the outcome-led hero as a validation layer, never as the headline
 * (brief D-03). Full-bleed `ink` because DESIGN.md reserves dark bands for exactly
 * this: the credibility and conversion beats — so `DarkBand` wraps the container
 * rather than sitting inside it.
 *
 * Two hard constraints:
 *  - The capability copy names nuclear-grade QA discipline as a CAPABILITY with no
 *    client and no project named (PRD DP-08). That lives in `messages`, so it is
 *    reviewable and translatable.
 *  - Never a navy button on the ink band (DESIGN.md § Don't) — both CTAs use the
 *    `onDark*` variants, and the phone keeps its visible number in its accessible
 *    name.
 *
 * Cert marks are UI content, not a DB read (decision Q4): no company-level
 * certification entity exists, and `Document{type: certificate}` rows are PRODUCT
 * documents owned by Story 2.3. Epic 4 (FR36 "Homepage content") makes these
 * editable. They are proper nouns, so they are identical in every locale.
 */
const CERTS = ["ISO 9001", "CE", "EN 54", "A.TR"] as const;

export function HomeCredibility() {
  const t = useTranslations("Home");
  const tNav = useTranslations("Nav");

  return (
    <DarkBand>
      <div className={`${CONTAINER} py-14 md:py-16`}>
        <TwoColumn
          sideWidth={320}
          main={
            <div>
              {/* Default `accent` tone: accent-soft is 4.70:1 on ink — the one
                  surface where it clears AA. */}
              <Kicker>{t("credibilityKicker")}</Kicker>
              <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white md:text-[28px]">
                {t("credibilityTitle")}
              </h2>
              <p className="mt-4 max-w-[62ch] leading-relaxed text-on-dark-text">
                {t("capability")}
              </p>

              <div className="mt-8 border-t border-on-dark-border pt-6">
                <Kicker>{t("certsLabel")}</Kicker>
                <div className="mt-3 flex flex-wrap gap-2">
                  {CERTS.map((cert) => (
                    // `onDark`, not `outline`: the light variants ship a light fill,
                    // which on the ink band reads as a solid white button.
                    <Chip key={cert} variant="onDark" cert>
                      {cert}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          }
          side={
            <div className="flex flex-col gap-3">
              <p className="font-heading text-lg font-semibold leading-snug text-white">
                {t("ctaTitle")}
              </p>
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
