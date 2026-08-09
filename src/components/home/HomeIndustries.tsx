import { useTranslations } from "next-intl";
import { SectionHeader } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";
import type { IndustryListItem } from "@/server/repositories/industry";

/**
 * Industry entry points (Story 1.7, FR8) — the industry-led IA made visible on the
 * homepage.
 *
 * DISPLAY-ONLY in v1 (decision Q1): the industry landing pages are Story 2.1, and
 * FR8's AC forbids a homepage entry point that resolves to a dead page. The 1.6
 * review escalated the bare-404 problem to Story 1.9 precisely because links to
 * unbuilt routes had multiplied — this section does not add more. Epic 2 wires the
 * hrefs when the targets exist.
 */
export function HomeIndustries({ industries }: { industries: IndustryListItem[] }) {
  const t = useTranslations("Home");

  return (
    <section className="border-b border-border-subtle bg-surface">
      <div className={`${CONTAINER} py-12 md:py-16`}>
        <SectionHeader
          kicker={t("industriesKicker")}
          title={t("industriesTitle")}
          sub={t("industriesSub")}
        />

        {industries.length === 0 ? (
          <p className="mt-6 text-ink-2">{t("industriesEmpty")}</p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((industry) => (
              <li key={industry.id} className="border border-border-subtle bg-surface p-5">
                <span
                  lang={industry.isFallback ? "en" : undefined}
                  className="font-heading text-base font-semibold text-ink"
                >
                  {industry.name}
                </span>
                <FallbackNotice isFallback={industry.isFallback} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
