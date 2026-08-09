import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface ProjectListItem {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  outcome: string | null;
  /** True when the title/description/outcome fell back to EN. */
  isFallback: boolean;
  /** Null when the project has no industry — `industry_id` is a nullable FK. */
  industry: { slug: string; name: string } | null;
  deliveredAt: Date | null;
  /** Media descriptors (JSONB); shape is content-defined. Empty for the seed set. */
  media: unknown;
}

/**
 * The minimum structural shape `toProjectListItem` consumes. Deliberately narrower
 * than Prisma's row type so the mapper can be unit-tested with plain objects —
 * Prisma's richer rows remain assignable.
 */
export interface ProjectRow {
  id: string;
  slug: string;
  deliveredAt: Date | null;
  media: unknown;
  translations: readonly {
    locale: Locale;
    title: string;
    description: string | null;
    outcome: string | null;
  }[];
  industry: { slug: string; translations: readonly { locale: Locale; name: string }[] } | null;
}

/**
 * Resolve one project row for `locale` (EN fallback, FR34a).
 *
 * The project and its industry resolve INDEPENDENTLY: a project can be translated
 * while its industry is not. `isFallback` therefore reports the project's own text
 * only — that is what the "shown in English" marker sits next to.
 */
export function toProjectListItem(project: ProjectRow, locale: Locale): ProjectListItem {
  const t = resolveTranslation(project.translations, locale);
  const it = project.industry ? resolveTranslation(project.industry.translations, locale) : null;

  return {
    id: project.id,
    slug: project.slug,
    title: t?.value.title ?? project.slug,
    description: t?.value.description ?? null,
    outcome: t?.value.outcome ?? null,
    isFallback: t?.isFallback ?? false,
    industry: project.industry
      ? { slug: project.industry.slug, name: it?.value.name ?? project.industry.slug }
      : null,
    deliveredAt: project.deliveredAt,
    media: project.media,
  };
}

/**
 * List published projects, newest delivered first, with names resolved for
 * `locale`. Data access lives here, never in components/routes (CLAUDE.md).
 *
 * Two things this MUST get right:
 *  - `status` defaults to `draft`, so an unfiltered read would leak unpublished work.
 *  - `delivered_at` is nullable and Postgres sorts NULLS FIRST on DESC, which would
 *    rank an undated project above a dated one. `nulls: "last"` pins undated rows to
 *    the bottom; `slug` breaks the remaining ties so the order is deterministic.
 */
export async function listPublishedProjects(
  locale: Locale,
  limit?: number,
): Promise<ProjectListItem[]> {
  const projects = await prisma.project.findMany({
    where: { status: "published" },
    include: { translations: true, industry: { include: { translations: true } } },
    orderBy: [{ deliveredAt: { sort: "desc", nulls: "last" } }, { slug: "asc" }],
    take: limit,
  });

  return projects.map((project) => toProjectListItem(project, locale));
}
