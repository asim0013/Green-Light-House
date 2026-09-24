import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Kicker, DarkBand, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE, type SitePhone } from "@/config/site";
import { SlaSummary } from "@/components/sla/SlaSummary";
import type { SlaContent } from "@/server/repositories/sla";
import { hasSlaSummary } from "@/lib/sla-content";

/**
 * The closing CTA band for the Projects surfaces (Story 3.1, AC15).
 *
 * Structurally IDENTICAL to `IndustryCta` and the `/services` band: `DarkBand` +
 * `TwoColumn sideWidth={320}` + `Kicker` + white h2 + `on-dark-text` lead + the
 * mono SLA line + `onDarkPrimary`/`onDarkSecondary`. DESIGN.md § Elevation makes
 * the dark band the treatment for closing CTAs, and a third instance that drifted
 * would strand this page when the shared treatment next changes.
 *
 * ⚠️ THE SLA COMES FROM THE CONTENT MODEL (Story 3.5), threaded in as a prop by
 * the page. It used to BORROW the `Industry.sla` message key — the 2.6 review had
 * found four uncentralised copies, with TR and RU inventing a commitment EN never
 * made, so this surface refused to mint a fifth. Those keys are now deleted and
 * the sharing is structural rather than a convention: one row, nine render sites,
 * and an admin edit reaches all of them without a deploy.
 *
 * ✅ THE PROMISE NOW SHIPS (Story 3.4, Task 0 #20 — an Asim decision). Story 3.1
 * deliberately withheld the canvas's "We'll open an inquiry pre-filled with this
 * project's scope — swap models, adjust quantities and send" because `/rfq` read
 * no query params and the site must not promise behaviour it does not have.
 * Story 3.4 made it true, so the sentence lands — on the DETAIL page only, since
 * the index has no project in view.
 *
 * ⚠️ THE FACTS CARD NOW EXISTS (Story 3.1b) AND ITS TRUST LINE IS STILL HELD, for
 * a new reason. `ProjectFactsCard` deliberately ships label/value rows and NO CTA
 * footer — a UX-DR7 departure recorded in its own docstring — precisely because
 * THIS component already carries the RFQ CTA and a ≥44px `tel:` action on the
 * same page. Shipping the canvas's trust line there would also mount
 * `SlaSummary`, making the card a TENTH SLA render site and hard-failing the
 * discovery self-check in `sla-hygiene.test.ts`.
 *
 * THE HREF has carried `?project=<slug>` since Story 3.1 (Task 0 #7) — a
 * different thing from the copy, and the reason 3.4's amendment list names only
 * the product, industry and search CTAs.
 */
export function ProjectCta({
  projectSlug,
  sla,
  phone = SITE,
}: {
  projectSlug?: string;
  /** The response process (Story 3.5); `null` only when unseeded. */
  sla: SlaContent | null;
  /** The `tel:` phone (Story 4.8). Defaults to the `SITE` placeholder. */
  phone?: SitePhone;
}) {
  const t = useTranslations("Projects");
  const tNav = useTranslations("Nav");

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
              {/* The promise Story 3.1 withheld, landed by 3.4 (Task 0 #20).
                  ONLY on the detail page: the index has no project in view, so
                  "this project's scope" would dangle exactly as the title would.
                  The facts-card trust line stays held — the facts card is Story
                  3.1b and does not exist yet, so its copy has nowhere to go. */}
              {projectSlug && (
                <p className="mt-5 max-w-[52ch] text-[15px] leading-relaxed text-on-dark-text">
                  {t("ctaPrefillPromise")}
                </p>
              )}
              {/* From the content model since Story 3.5. This surface BORROWED
                  `Industry.sla` to avoid minting a fifth copy — that key is gone
                  and the borrow is now a real shared source. */}
              {hasSlaSummary(sla) && (
                <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
                  <SlaSummary sla={sla} tone="onDark" />
                </p>
              )}
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
                href={`tel:${phone.phone}`}
                aria-label={`${tNav("phoneLabel")}: ${phone.phoneDisplay}`}
                className={buttonClasses("onDarkSecondary", "min-h-11 w-full gap-2 font-data")}
              >
                <Phone size={16} aria-hidden />
                {phone.phoneDisplay}
              </a>
            </div>
          }
        />
      </div>
    </DarkBand>
  );
}
