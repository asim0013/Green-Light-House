import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSlaContent } from "@/server/repositories/sla";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { getProjectsPageData, projectsIndexSignals, groupByIndustry } from "@/server/project-page";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { ProjectCta } from "@/components/projects/ProjectCta";
import { Kicker } from "@/components/ui";
import { CONTAINER } from "@/components/layout/container";

/**
 * `/[locale]/projects` — delivered work GROUPED BY INDUSTRY (Story 3.1, FR21).
 *
 * SSR per request: this reads live DB content, so it must not be baked into the
 * static build (a build must never require a running Postgres).
 */
export const dynamic = "force-dynamic";

/**
 * There is deliberately NO `generateStaticParams` — see the long note in
 * `products/[slug]/page.tsx`. Next executes `buildAppStaticPaths` for any route
 * with dynamic segments regardless of `dynamic`, so a DB-reading version would
 * break the Postgres-free build, and a warm Redis would MASK that failure.
 */

/*
 * `groupByIndustry` moved to `@/server/project-page` in the 3.1 review: as a
 * page-private function its null-industry branch had no test at any level.
 */

export async function generateMetadata(props: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Projects" });
  const projects = await getProjectsPageData(locale);

  return {
    title: t("indexTitle"),
    // ONE PREDICATE PER SURFACE: `sitemap.ts` calls this same function, so the page
    // can never be `noindex` while the sitemap still advertises it (Story 3.1, AC4).
    robots: robotsFor(projectsIndexSignals(locale, projects)),
    alternates: alternatesFor(locale, "/projects"),
  };
}

export default async function ProjectsPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Story 3.5: ONE read per request, threaded down. The components cannot fetch
  // (see `SlaStepper`), and `getSlaContent` is React-`cache()`d so a page mounting
  // two consumers still makes a single round trip.
  const sla = await getSlaContent(locale);

  const t = await getTranslations({ locale, namespace: "Projects" });
  const projects = await getProjectsPageData(locale);
  const groups = groupByIndustry(projects);

  return (
    <>
      <section className="bg-surface">
        <div className={`${CONTAINER} py-14 md:py-16`}>
          <Kicker tone="ink">{t("indexKicker")}</Kicker>
          <h1 className="mt-3 font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
            {t("indexTitle")}
          </h1>
          <p className="mt-5 max-w-[68ch] text-[17px] leading-relaxed text-ink-2">
            {t("indexLead")}
          </p>

          {/* A DEFINED EMPTY STATE, never a blank region — the `IndustrySection`
              precedent. A zero-project index is also the only thin case for this
              surface, so it is `noindex` and absent from the sitemap. */}
          {groups.length === 0 ? (
            <p className="mt-10 max-w-[68ch] leading-relaxed text-ink-2">{t("indexEmpty")}</p>
          ) : (
            <div className="mt-12 flex flex-col gap-12">
              {groups.map((group) => (
                // The sentinel key from the grouping itself — a plain "none" here
                // would collide with an industry literally slugged "none".
                <section key={group.key}>
                  <h2 className="font-heading text-xl font-semibold tracking-tight text-ink">
                    {/* The industry NAME falls back independently of any project on
                        this page (FR34a) — live today on /ru, where fire-safety has
                        no ru row and this heading is English. */}
                    <span lang={group.isFallback ? "en" : undefined}>
                      {group.slug ? group.name : t("noIndustryGroup")}
                    </span>
                    <FallbackNotice isFallback={group.isFallback} />
                  </h2>
                  {/* Cards are h3 under this h2 — the outline is h1 → h2 → h3, which
                      is why `ProjectCard`'s default heading level is correct here.
                      Same 3 → 2 → 1 ladder as every other grid. */}
                  <ul className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {group.items.map((project) => (
                      <ProjectCard key={project.id} project={project} />
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </section>

      <ProjectCta sla={sla} />
    </>
  );
}
