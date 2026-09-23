import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionHeader } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";
import type { IndustryListItem } from "@/server/repositories/industry";
import type { HomeContent } from "@/server/repositories/home-content";

/**
 * Industry entry points (Story 1.7, FR8) — the industry-led IA made visible on the
 * homepage.
 *
 * LINKED as of Story 2.1. These were deliberately display-only in v1: FR8's AC
 * forbids a homepage entry point that resolves to a dead page, and the 1.6 review
 * escalated the bare-404 problem precisely because links to unbuilt routes had
 * multiplied. `/industries/<slug>` now exists for every seeded industry, so the
 * hrefs are wired — which is what this section was waiting for.
 */
export function HomeIndustries({
  industries,
  content = null,
}: {
  industries: IndustryListItem[];
  content?: HomeContent | null;
}) {
  const t = useTranslations("Home");

  return (
    /* No hairline: the next section changes fill (surface-2), which is the
       separator. DESIGN.md — hairline OR fill change, never both. */
    <section className="bg-surface">
      <div className={`${CONTAINER} py-12 md:py-16`}>
        <SectionHeader
          kicker={t("industriesKicker")}
          title={content?.industriesTitle ?? t("industriesTitle")}
          sub={content?.industriesSub ?? t("industriesSub")}
        />

        {industries.length === 0 ? (
          <p className="mt-6 text-ink-2">{t("industriesEmpty")}</p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {industries.map((industry) => (
              <li key={industry.id}>
                <Link
                  href={`/industries/${industry.slug}`}
                  className="flex h-full flex-col border border-border-subtle bg-surface p-5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <span className="font-heading text-base font-semibold text-ink">
                    <span lang={industry.isFallback ? "en" : undefined}>{industry.name}</span>
                    <FallbackNotice isFallback={industry.isFallback} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
