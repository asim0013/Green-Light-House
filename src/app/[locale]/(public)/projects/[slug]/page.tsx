import type { Metadata } from "next";
import { hasLocale } from "next-intl";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { getSlaContent } from "@/server/repositories/sla";
import { alternatesFor, robotsFor } from "@/lib/seo";
import { isValidSlug } from "@/lib/slug";
import { getProjectPageData, projectSignals, projectHref } from "@/server/project-page";
import { ProjectMediaBand } from "@/components/projects/ProjectMediaBand";
import { ProjectNotFound } from "@/components/projects/ProjectNotFound";
import { ProjectCta } from "@/components/projects/ProjectCta";
import { ProjectFactsCard, hasProjectFacts } from "@/components/projects/ProjectFactsCard";
import { ProjectBomTable } from "@/components/projects/ProjectBomTable";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProductCard } from "@/components/catalog/ProductCard";
import { TwoColumn } from "@/components/ui";
import { listProjectsByIndustry } from "@/server/repositories/project";
import { selectRelatedProjects } from "@/server/project-page";
import { PROJECT_LIMIT } from "@/server/industry-page";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { Breadcrumb, type Crumb, Kicker } from "@/components/ui";
import { CONTAINER } from "@/components/layout/container";

/**
 * `/[locale]/projects/<slug>` — one delivered project (Story 3.1, FR21).
 *
 * SSR per request — this reads live DB content, so it must not be baked into the
 * static build. Tag-based ISR caching layers onto the same read path.
 */
export const dynamic = "force-dynamic";

/**
 * THERE IS DELIBERATELY NO `generateStaticParams` HERE, and `force-dynamic` above
 * is NOT what makes that safe.
 *
 * Next executes `buildAppStaticPaths` for ANY route with dynamic segments, with no
 * `dynamic` check — it skips only segments that do not export the function. So a
 * database-reading `generateStaticParams` would break the Postgres-free build even
 * with `force-dynamic` set. Omitting it is REQUIRED, not a style choice. A warm
 * Redis also MASKS that failure, which is why CI blanks `REDIS_URL` for the build.
 */

/**
 * THE SLUG GATE. Runs before any query or cache key is built, using the shared
 * `isValidSlug`.
 *
 * BE HONEST ABOUT WHAT IT BOUNDS: SHAPE and LENGTH, never CARDINALITY. A
 * well-formed unknown slug still reaches the repository and still mints a cache
 * entry — a known, deferred item shared with the other detail routes. What it does
 * close is the malformed-value class and oversized-cache-tag log amplification.
 */
function gateSlug(slug: string): string | null {
  return isValidSlug(slug) ? slug : null;
}

export async function generateMetadata(props: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) return {};

  const t = await getTranslations({ locale, namespace: "Projects" });
  const safeSlug = gateSlug(slug);
  const project = safeSlug ? await getProjectPageData(safeSlug, locale) : null;

  if (!project) {
    // A slug that resolves to nothing — malformed, unknown, or DRAFT — must never
    // be indexed. Next injects `noindex` automatically for a real 404 STATUS; this
    // page deliberately returns 200, so it has to say so itself. No canonical and
    // no hreflang either: they would advertise a page that is not there.
    return { title: t("notFoundTitle"), robots: { index: false, follow: true } };
  }

  return {
    title: project.title,
    // The SAME function `sitemap.ts` calls, so the two cannot disagree about this
    // project (Story 3.1, AC4).
    robots: robotsFor(projectSignals(locale, project)),
    alternates: alternatesFor(locale, projectHref(project.slug)),
  };
}

export default async function ProjectDetailPage(props: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  // Story 3.5: ONE read per request, threaded down. The components cannot fetch
  // (see `SlaStepper`), and `getSlaContent` is React-`cache()`d so a page mounting
  // two consumers still makes a single round trip.
  const sla = await getSlaContent(locale);

  const t = await getTranslations({ locale, namespace: "Projects" });
  // Read from `Industry`: `deliveredOn` already exists there with reviewed TR/RU,
  // and a second copy in the Projects namespace is exactly the duplication the 2.6
  // review found four times over for the SLA line.
  const safeSlug = gateSlug(slug);
  const project = safeSlug ? await getProjectPageData(safeSlug, locale) : null;

  if (!project) {
    return (
      <>
        {/* A distinct current crumb — "Projects / Projects" read as a stutter
            (3.1 review); the sibling routes' `notFoundCrumb` convention. */}
        <Breadcrumb
          items={[{ label: t("crumb"), href: "/projects" }, { label: t("notFoundCrumb") }]}
        />
        <ProjectNotFound />
      </>
    );
  }

  /**
   * The middle crumb points at `/industries/<slug>`, NOT a projects filter view.
   *
   * The canvas draws "Projects / Oil & Gas / <title>", which implies a
   * `/projects?industry=<slug>` surface nobody planned and no story funds. The
   * sector landing page is the closest real destination; building the filter view
   * would be scope this story does not own. It is omitted entirely when the
   * project has no industry, rather than rendering a crumb that leads nowhere.
   */
  const crumbs: Crumb[] = [
    { label: t("crumb"), href: "/projects" },
    ...(project.industry
      ? [
          {
            label: project.industry.name,
            href: `/industries/${project.industry.slug}`,
            // The industry name falls back independently of the title (3.1
            // review) — same slot, same treatment as products/[slug].
            isFallback: project.industry.isFallback,
          },
        ]
      : []),
    { label: project.title, isFallback: project.isFallback },
  ];
  /**
   * The related row's read (Story 3.1b, AC5).
   *
   * ⚠️ `PROJECT_LIMIT + 1`, NOT `PROJECT_LIMIT`. `listProjectsByIndustry` has no
   * self-exclusion, so the current project comes back in its own related list —
   * taking three and then filtering yields TWO cards where three were asked for.
   * Oil & gas has exactly two published projects today, so no fixture can expose
   * that off-by-one; `selectRelatedProjects` is unit-tested over a synthetic set
   * for exactly that reason.
   */
  const related = project.industry
    ? selectRelatedProjects(
        await listProjectsByIndustry(project.industry.slug, locale, PROJECT_LIMIT + 1),
        project.slug,
        PROJECT_LIMIT,
      )
    : [];

  return (
    <>
      <Breadcrumb items={crumbs} />
      <ProjectMediaBand project={project} locale={locale} />

      <section className="bg-surface">
        <div className={`${CONTAINER} py-12 md:py-16`}>
          <TwoColumn
            sideWidth={380}
            side={hasProjectFacts(project) ? <ProjectFactsCard project={project} /> : null}
            main={
              <>
                <Kicker tone="ink">{t("kicker")}</Kicker>
                <h1 className="mt-3 max-w-[24ch] font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
                  <span lang={project.isFallback ? "en" : undefined}>{project.title}</span>
                  <FallbackNotice isFallback={project.isFallback} />
                </h1>

                {/* Every row below is optional in the schema — only `title` is NOT NULL —
              so each renders ONLY when it has content, never as an empty shell. */}
                {project.description && (
                  <p className="mt-5 max-w-[68ch] text-[17px] leading-relaxed text-ink-2">
                    <span lang={project.descriptionIsFallback ? "en" : undefined}>
                      {project.description}
                    </span>
                    <FallbackNotice isFallback={project.descriptionIsFallback} />
                  </p>
                )}

                {project.outcome && (
                  <div className="mt-8 border-l-2 border-accent pl-5">
                    <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
                      {t("outcomeLabel")}
                    </p>
                    <p className="mt-2 max-w-[68ch] leading-relaxed text-ink">
                      {/* Its own flag: a `tr` row can exist while leaving `outcome` NULL,
                    so the outcome falls back independently of the title (AC2b). */}
                      <span lang={project.outcomeIsFallback ? "en" : undefined}>
                        {project.outcome}
                      </span>
                      <FallbackNotice isFallback={project.outcomeIsFallback} />
                    </p>
                  </div>
                )}

                {/* ⚠️ THE BODY'S DELIVERED PARAGRAPH IS GONE (Story 3.1b, AC7). The
              facts card beside this column is now the single home for the
              delivered date, and keeping both stated it twice in two formats.
              Nothing in the e2e suite asserted this paragraph in either
              direction, so the removal is invisible to every existing gate and is
              asserted explicitly by this story's own test.

              "Once ON THE PAGE" is deliberately NOT the target and is not
              achievable: `ProjectMediaBand` renders a year-granularity chip on
              its NO-PHOTO branch, and the breadcrumb renders the sector. Those
              are different granularities in different regions, and they stay. */}
              </>
            }
          />
        </div>
      </section>

      {/* THE SCOPE OF SUPPLY — the bill of materials (Story 3.1b, AC2). The
          authoritative record of what was delivered, including the line no
          product card can represent. */}
      {project.bomLines.length > 0 && (
        <section className="bg-surface">
          <div className={`${CONTAINER} pb-12 md:pb-16`}>
            <Kicker tone="ink">{t("scopeKicker")}</Kicker>
            <h2 className="mt-3 font-heading text-xl font-semibold tracking-tight text-ink">
              {t("scopeHeading")}
            </h2>
            <ProjectBomTable lines={project.bomLines} />
          </div>
        </section>
      )}

      {/* Equipment supplied — the catalog-backed subset, as cards. The BOM table
          above is the complete record; this row is the browsable teaser. */}
      {project.products.length > 0 && (
        <section className="bg-surface-2">
          <div className={`${CONTAINER} py-12 md:py-16`}>
            <Kicker tone="ink">{t("equipmentKicker")}</Kicker>
            <h2 className="mt-3 font-heading text-xl font-semibold tracking-tight text-ink">
              {t("equipmentTitle")}
            </h2>
            {/* 3 → 2 → 1, per EXPERIENCE.md § Responsive. The canvas draws four
                across; the shipped ladder caps at three and wins (a recorded
                reconciliation verdict, not a fresh decision).

                ⛔ THE CAP IS APPLIED HERE, AT RENDER — NEVER AS A `take:` IN THE
                READ. The equipment cards and the BOM table come from ONE read of
                `bomLines`; a `take: 3` would truncate the table too and its
                DERIVED footer would render "3 line items / 290 units" against a
                five-line delivery. Four published products are linked, and four
                cards on a 3-column ladder is the 3+1 orphan wrap that set
                `PRODUCT_LIMIT` to 3 in the first place. */}
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {project.products.slice(0, PROJECT_LIMIT).map((product) => (
                <li key={product.id} className="flex">
                  <div className="flex w-full">
                    <ProductCard product={product} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* "More in <industry>" (Story 3.1b, AC5) — BUILT NEW; no related row
          existed before this story.

          ⚠️ OMITTED ENTIRELY when the project has no industry. `industry_id` is a
          nullable FK and `standalone-workshop-fitout` is a live published fixture
          with none, so there is no industry NAME to put in the heading — a
          section headed "More in undefined" is worse than no section. Omitted
          also when the filter leaves nothing, so the region is never blank. */}
      {related.length > 0 && project.industry && (
        <section className="bg-surface">
          <div className={`${CONTAINER} py-12 md:py-16`}>
            <Kicker tone="ink">{t("relatedKicker")}</Kicker>
            <h2 className="mt-3 font-heading text-xl font-semibold tracking-tight text-ink">
              <span lang={project.industry.isFallback ? "en" : undefined}>
                {t("relatedHeading", { industry: project.industry.name })}
              </span>
              <FallbackNotice isFallback={project.industry.isFallback} />
            </h2>
            <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <ProjectCard key={item.id} project={item} />
              ))}
            </ul>
          </div>
        </section>
      )}

      <ProjectCta projectSlug={project.slug} sla={sla} />
    </>
  );
}
