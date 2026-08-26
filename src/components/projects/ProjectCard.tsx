import { useTranslations, useFormatter } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { projectHref } from "@/lib/project-href";
import type { ProjectListItem } from "@/server/repositories/project";

/**
 * One delivered project, as both the `/projects` index and the industry page's
 * Delivered-projects block render it (Story 3.1).
 *
 * EXTRACTED, NOT COPIED. `IndustryProjects` drew this markup inline and the new
 * index needed the same card; two copies would drift on the FR34a marking the way
 * `ServiceList` records for services. The industry page's rendered output is
 * unchanged by the extraction except for the newly-added link — which is the
 * point of AC13: `IndustryProjects` rendered inert `<li>`s and nothing on the site
 * linked to a project at all.
 *
 * ⚠️ IT IS AN `<li>`, NOT AN `<article>`, AND THAT IS DELIBERATE. `<article>`
 * appears exactly ONCE in all of `src/` — `ProductCard` — and 23 `locator("article")`
 * assertions across `e2e/` silently mean "number of ProductCards". A `ProjectCard`
 * using `<article>` would change the industry page's page-wide count and the
 * failure would look unrelated to this story. `<li>` is also what this block
 * already rendered, so the refit is genuinely inert there.
 *
 * HEADING LEVEL IS THE CONSUMER'S, NOT THE COMPONENT'S (the 2.6 lesson). A
 * hard-coded `h3` was correct by construction inside `IndustrySection`, which
 * always renders an `h2` above it — and produced a real axe `heading-order`
 * violation the moment the same component was reused on a page with no such
 * wrapper. The index passes 3 because its group headings are `h2`s.
 */
export function ProjectCard({
  project,
  headingLevel = 3,
}: {
  project: ProjectListItem;
  headingLevel?: 2 | 3;
}) {
  const t = useTranslations("Industry");
  const format = useFormatter();
  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    // `relative` anchors the heading link's stretched overlay — the ProductCard
    // idiom, so the whole card is clickable while the accessible name stays the
    // project's own title.
    <li className="relative border border-border-subtle bg-surface p-5 transition-colors hover:border-ink-2">
      <Heading className="font-heading text-base font-semibold leading-snug text-ink">
        <Link
          href={projectHref(project.slug)}
          className="after:absolute after:inset-0 hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <span lang={project.isFallback ? "en" : undefined}>{project.title}</span>
        </Link>
        {/* Outside the link: the notice is ABOUT the title, not part of it, so the
            accessible name stays the project's own. */}
        <FallbackNotice isFallback={project.isFallback} />
      </Heading>

      {project.outcome && (
        <p className="mt-3 leading-relaxed text-ink-2">
          {/* The outcome falls back INDEPENDENTLY of the title (Story 3.1, AC2b):
              a `tr` row can exist while leaving `outcome` NULL, which is the actual
              seeded state. It therefore carries its OWN flag — marking only the
              string that really fell back, as ProductCard does for manufacturers. */}
          <span lang={project.outcomeIsFallback ? "en" : undefined}>{project.outcome}</span>
          <FallbackNotice isFallback={project.outcomeIsFallback} />
        </p>
      )}

      {project.deliveredAt && (
        /* One message with a {date} placeholder, never label + date concatenated —
           the order and punctuation differ per language. Reuses the existing
           `Industry.deliveredOn`, which already has reviewed TR/RU, rather than
           minting a second copy in the Projects namespace. */
        <p className="mt-4 border-t border-border-subtle pt-4 font-data text-xs text-ink-2">
          {t("deliveredOn", {
            date: format.dateTime(project.deliveredAt, { year: "numeric", month: "long" }),
          })}
        </p>
      )}
    </li>
  );
}
