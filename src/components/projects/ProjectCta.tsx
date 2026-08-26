import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Kicker, DarkBand, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";

/**
 * The closing CTA band for the Projects surfaces (Story 3.1, AC15).
 *
 * Structurally IDENTICAL to `IndustryCta` and the `/services` band: `DarkBand` +
 * `TwoColumn sideWidth={320}` + `Kicker` + white h2 + `on-dark-text` lead + the
 * mono SLA line + `onDarkPrimary`/`onDarkSecondary`. DESIGN.md § Elevation makes
 * the dark band the treatment for closing CTAs, and a third instance that drifted
 * would strand this page when the shared treatment next changes.
 *
 * ⚠️ THE SLA COMES FROM THE EXISTING KEY. `Industry.sla` and `Product.sla` already
 * carry "Technical review in 24 h · specced proposal in 3 working days" with
 * reviewed TR/RU. The 2.6 review found FOUR uncentralised copies, with TR and RU
 * inventing a commitment EN never made — so this reads `Industry.sla` rather than
 * minting a fifth.
 *
 * ⚠️ THE DOORWAY PROMISES NOTHING IT CANNOT DO YET (Task 0 #3). The canvas puts
 * "We'll open an inquiry pre-filled with this project's scope — swap models,
 * adjust quantities and send" here. `/rfq` is live since Story 3.2, but
 * pre-fill is STILL Story 3.4's — 3.2 reads no query params, so the sentence
 * remains a promise the site cannot keep. The LABEL ships; the promise waits
 * for 3.4.
 *
 * ⚠️ THE HREF CARRIES `?project=<slug>` ANYWAY (Task 0 #7), which is a different
 * thing from the copy. `project` is already frozen in `PREFILL_PARAMS`, the param
 * is inert until 3.4 reads it, and 3.4's amendment list names the product,
 * industry and search CTAs while deliberately omitting the project surfaces — so
 * if this story does not emit it, no story ever does.
 */
export function ProjectCta({ projectSlug }: { projectSlug?: string }) {
  const t = useTranslations("Projects");
  const tNav = useTranslations("Nav");
  // Read from `Industry`, not re-declared here — see the SLA note above.
  const tIndustry = useTranslations("Industry");

  const rfqHref = projectSlug
    ? `${SITE.rfqHref}?project=${encodeURIComponent(projectSlug)}`
    : SITE.rfqHref;

  return (
    <DarkBand>
      <div className={`${CONTAINER} py-14 md:py-16`}>
        <TwoColumn
          sideWidth={320}
          main={
            <div>
              {/* The INDEX has no project in view, so "Start your inquiry from
                  this project" would dangle (3.1 review) — every string branches
                  with the button, not just the button. */}
              <Kicker>{projectSlug ? t("ctaKicker") : t("ctaKickerIndex")}</Kicker>
              <h2 className="mt-3 font-heading text-2xl font-bold tracking-tight text-white md:text-[28px]">
                {projectSlug ? t("ctaTitle") : t("ctaTitleIndex")}
              </h2>
              <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
                {tIndustry("sla")}
              </p>
            </div>
          }
          side={
            <div className="flex flex-col gap-3">
              <Link href={rfqHref} className={buttonClasses("onDarkPrimary", "w-full text-center")}>
                {projectSlug ? t("doorwayCta") : tNav("requestQuote")}
              </Link>
              {/* Renders the NUMBER with the label as its accessible name — the
                  shipped convention. Also discharges Story 3.6's project-page
                  obligation: a >=44px `tel:` action. 3.6's residual is click
                  tracking only. */}
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
