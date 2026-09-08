import type { ReactNode } from "react";
import { useTranslations, useFormatter } from "next-intl";
import type { ProjectDetail } from "@/server/repositories/project";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { Kicker } from "@/components/ui";

/**
 * The project facts card (Story 3.1b — AC1, AC7).
 *
 * ⚠️ ROWS ONLY — NO CTA FOOTER, AND THAT IS A DELIBERATE UX-DR7 DEPARTURE.
 * UX-DR7 (`epics:170`) and DESIGN.md:175 specify the anchor card as "label/value
 * rows + primary+secondary CTA + mono trust line", and the canvas draws that
 * footer. The shipped sibling (`ProductAnchorCard`) implements it. This card
 * omits it because `ProjectCta` ALREADY carries the RFQ CTA and a ≥44px `tel:`
 * action ON THIS SAME PAGE — a second RFQ region would be duplication, not
 * depth. Recorded as a departure rather than left to read as an oversight.
 *
 * ⚠️ It also avoids a trap: the trust line is `SlaSummary`, so shipping it would
 * make this card a TENTH SLA render site and hard-fail the discovery self-check
 * in `sla-hygiene.test.ts` unless `EXPECTED_TONE` were edited in the same change.
 *
 * ⚠️ AND IT IS BUILT ON THE EXISTING `TwoColumn`, NOT BY EXTRACTING A SHARED
 * `ui/AnchorCard` FROM `ProductAnchorCard`. That extraction would MOVE one of the
 * nine SLA render sites and hard-fail the same self-check. `TwoColumn`'s own
 * docstring already names "facts cards (380)" as a supported width — the cheap
 * path was designed in.
 *
 * ⛔ EVERY ROW IS INDIVIDUALLY OPTIONAL AND AN ABSENT VALUE OMITS ITS ROW —
 * never a bare label above nothing, which is the defect the Story 3.5 review
 * found on six surfaces and the Story 3.8 contact page was built to avoid. If
 * EVERY row is absent the card does not render at all (the caller checks).
 */

/** True when the card would render at least one row. */
export function hasProjectFacts(project: ProjectDetail): boolean {
  return Boolean(
    project.industry ||
    project.location ||
    project.deliveredAt ||
    project.scope ||
    project.leadTimeWeeks !== null,
  );
}

function FactRow({
  label,
  children,
  isFallback = false,
}: {
  label: string;
  children: ReactNode;
  isFallback?: boolean;
}) {
  return (
    <div className="border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
      {/* ⛔ `ink-2`, NOT `muted`. `muted` measures 3.10:1 on white — an AA failure
          at this size — and the ratios are already recorded in `Kicker.tsx`. The
          canvas colours these labels `$muted`; Story 3.1 made the same correction
          on this page and this follows it. */}
      <dt className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">{label}</dt>
      <dd className="mt-1 text-[15px] leading-relaxed text-ink">
        <span lang={isFallback ? "en" : undefined}>{children}</span>
        {isFallback && <FallbackNotice isFallback />}
      </dd>
    </div>
  );
}

export function ProjectFactsCard({ project }: { project: ProjectDetail }) {
  const t = useTranslations("Projects");
  const format = useFormatter();

  return (
    <div className="border border-border-subtle bg-surface p-5">
      <Kicker tone="ink">{t("factsKicker")}</Kicker>
      <dl className="mt-4 flex flex-col gap-3">
        {/* SECTOR carries the project's identity — the CLIENT row the canvas
            draws is deliberately NOT built. PRD DP-08 and EXPERIENCE.md:56 forbid
            naming the client, and a nullable free-text column expresses no such
            constraint while Epic 4's admin form is the writer. */}
        {project.industry && (
          <FactRow label={t("factSector")} isFallback={project.industry.isFallback}>
            {project.industry.name}
          </FactRow>
        )}
        {project.location && (
          <FactRow label={t("factLocation")} isFallback={project.locationIsFallback}>
            {project.location}
          </FactRow>
        )}
        {project.deliveredAt && (
          <FactRow label={t("factDelivered")}>
            {format.dateTime(project.deliveredAt, { year: "numeric", month: "long" })}
          </FactRow>
        )}
        {project.scope && (
          <FactRow label={t("factScope")} isFallback={project.scopeIsFallback}>
            {project.scope}
          </FactRow>
        )}
        {/* ⚠️ AN ICU PLURAL OVER AN INTEGER, never stored prose. The canvas writes
            this "six weeks" in one place and "6 wk" in another; no locale can
            derive a spelled-out numeral from an integer (`Intl` has no
            spell-out), so authoring the string would reintroduce exactly the
            number drift FR30 spent Story 3.5 eliminating. Russian needs the full
            one/few/many branch set — the parity gate cannot see that, because the
            placeholder set is identical in all three catalogues. */}
        {project.leadTimeWeeks !== null && (
          <FactRow label={t("factLeadTime")}>
            {t("leadTimeWeeks", { count: project.leadTimeWeeks })}
          </FactRow>
        )}
      </dl>
    </div>
  );
}
