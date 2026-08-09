import { Phone } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Chip, Kicker, TwoColumn } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";
import type { ProjectListItem } from "@/server/repositories/project";

/**
 * Projects-first hero (Story 1.7, FR7/FR9).
 *
 * Leads with a DELIVERED PROJECT, not a product grid: positioning + the co-equal
 * Request-Quote / phone pair on the fill-container main column, with the proof
 * card as the fixed 420 side (DESIGN.md's quote-box width).
 *
 * Server Component by design — this is the LCP surface, so it ships no client JS.
 * That is also why the CTAs use `buttonClasses` on links rather than `<Button>`,
 * which is `"use client"`.
 *
 * Every field of the project is nullable in the schema, and the project itself may
 * be absent (sparse launch), so each row renders only when it has content.
 */
export function HomeHero({ project }: { project: ProjectListItem | null }) {
  const t = useTranslations("Home");
  const tNav = useTranslations("Nav");
  const format = useFormatter();

  return (
    <section className="border-b border-border-subtle bg-surface">
      <div className={`${CONTAINER} py-12 md:py-16`}>
        <TwoColumn
          sideWidth={420}
          main={
            <div>
              <Kicker tone="ink">{t("kicker")}</Kicker>
              {/* Type steps down at the narrowest widths: at 34px the Russian
                  "противопожарное" is wider than a 320px column and pushes the
                  page into horizontal scroll (measured: 8px overflow at 320). */}
              <h1 className="mt-3 font-heading text-[26px] font-bold leading-[1.1] tracking-tight text-ink sm:text-[34px] md:text-[44px]">
                {t("title")}
              </h1>
              <p className="mt-5 max-w-[46ch] text-[17px] leading-relaxed text-ink-2">
                {t("lead")}
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link href={SITE.rfqHref} className={buttonClasses("primary")}>
                  {tNav("requestQuote")}
                </Link>
                {/* Co-equal phone (FR31): a first-class tel: action, not a footnote.
                    The visible number stays inside the accessible name (WCAG 2.5.3). */}
                <a
                  href={`tel:${SITE.phone}`}
                  aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
                  className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-data text-[15px] text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <Phone size={16} aria-hidden />
                  {SITE.phoneDisplay}
                </a>
              </div>

              {/* The SLA is the promise that replaces prices — EXPERIENCE.md says to
                  lead with it wherever it is promised, so it is essential copy and
                  must NOT use `muted` (3.10:1 on white). */}
              <p className="mt-7 border-t border-border-subtle pt-5 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-ink-2">
                {t("sla")}
              </p>
              <p className="mt-2 text-sm text-ink-2">{t("noPrices")}</p>
            </div>
          }
          side={project ? <ProofCard project={project} format={format} /> : <ProofEmpty />}
        />
      </div>
    </section>
  );
}

/** The delivered-project proof card — the hero's fixed-width side column. */
function ProofCard({
  project,
  format,
}: {
  project: ProjectListItem;
  format: ReturnType<typeof useFormatter>;
}) {
  const t = useTranslations("Home");
  // Fallen-back DB text is marked `lang="en"` so screen readers switch voice.
  const lang = project.isFallback ? "en" : undefined;
  const hasMeta = Boolean(project.industry ?? project.deliveredAt);

  return (
    <div className="border border-border-subtle bg-surface p-6">
      <Kicker tone="ink">{t("proofKicker")}</Kicker>
      <h2 className="mt-3 font-heading text-xl font-bold leading-snug tracking-tight text-ink">
        <span lang={lang}>{project.title}</span>
        <FallbackNotice isFallback={project.isFallback} />
      </h2>

      {project.outcome && (
        <p lang={lang} className="mt-4 text-[15px] leading-relaxed text-ink-2">
          {project.outcome}
        </p>
      )}

      {hasMeta && (
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-5">
          {project.industry && <Chip>{project.industry.name}</Chip>}
          {project.deliveredAt && (
            /* One message with a {date} placeholder, NOT label + date concatenated:
               the label/date order and punctuation differ per language, and
               concatenation produced ungrammatical Russian ("Поставлено июнь 2024 г."). */
            <span className="font-data text-xs text-ink-2">
              {t("deliveredOn", {
                date: format.dateTime(project.deliveredAt, { year: "numeric", month: "long" }),
              })}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Sparse-launch state (AC5): the catalog can be empty on day one, but the hero
 * still has to carry the positioning and both CTAs. Never a blank region.
 */
function ProofEmpty() {
  const t = useTranslations("Home");
  return (
    <div className="border border-border-subtle bg-surface-2 p-6">
      <Kicker tone="ink">{t("proofKicker")}</Kicker>
      <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{t("proofEmpty")}</p>
    </div>
  );
}
