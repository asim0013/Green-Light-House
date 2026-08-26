import { describe, it, expect, vi } from "vitest";

/**
 * next-intl's navigation module is a react-client entry vite cannot resolve under
 * vitest (it imports `next/navigation`), and `@/lib/seo` pulls it in through
 * `@/i18n/routing`. Stubbed exactly as `src/lib/seo.test.ts` and
 * `HomeHero.test.tsx` already do. Nothing here exercises routing.
 */
vi.mock("@/i18n/navigation", () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    href === "/" ? `/${locale}` : `/${locale}${href}`,
}));

import { projectHref, projectsIndexSignals, projectSignals, groupByIndustry } from "./project-page";
import type { ProjectListItem } from "@/server/repositories/project";
import { isIndexable } from "@/lib/seo";

/**
 * Story 3.1, AC4/AC5 — the ONE predicate behind both `/projects`' robots metadata
 * and `sitemap.ts`.
 *
 * These are the assertions that stop the two sides drifting, which they have done
 * silently three times in this project (1.9, 2.1's `/industries` index, 2.4's
 * product signals). What is pinned here is the VERDICT, not the call sites — a
 * route that computed indexability inline would still be wrong, which is why the
 * module exists at all.
 */

function project(over: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: "p1",
    slug: "lng-terminal-fire-gas-upgrade",
    title: "LNG terminal fire & gas upgrade",
    description: null,
    outcome: "142 field devices, ATEX Zone 1.",
    isFallback: false,
    descriptionIsFallback: false,
    outcomeIsFallback: false,
    industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
    deliveredAt: new Date("2024-06-01T00:00:00.000Z"),
    media: [],
    ...over,
  };
}

describe("projectHref", () => {
  it("encodes the slug — the sitemap does no XML escaping of its own", () => {
    expect(projectHref("lng-terminal-fire-gas-upgrade")).toBe(
      "/projects/lng-terminal-fire-gas-upgrade",
    );
    expect(projectHref("a b&c")).toBe("/projects/a%20b%26c");
  });
});

describe("projectsIndexSignals — the /projects index", () => {
  it("is indexable when it lists real work", () => {
    expect(isIndexable(projectsIndexSignals("en", [project(), project({ slug: "b" })]))).toBe(true);
  });

  it("is NOT indexable with zero projects — the only thin case for an index", () => {
    expect(isIndexable(projectsIndexSignals("en", []))).toBe(false);
  });

  it("is fallback-only when EVERY project falls back — /ru on today's seed", () => {
    // Zero `ru` project translations exist, so every row resolves via EN. The page
    // has nothing in the requested language and must not be indexed or listed.
    const ru = [project({ isFallback: true }), project({ slug: "b", isFallback: true })];
    expect(isIndexable(projectsIndexSignals("ru", ru))).toBe(false);
  });

  it("stays indexable when only SOME rows fall back", () => {
    const tr = [project({ isFallback: true }), project({ slug: "b", isFallback: false })];
    expect(isIndexable(projectsIndexSignals("tr", tr))).toBe(true);
  });

  it("never treats EN as a fallback of itself", () => {
    const en = [project({ isFallback: true })];
    expect(isIndexable(projectsIndexSignals("en", en))).toBe(true);
  });
});

describe("projectSignals — one project detail page", () => {
  it("counts description, outcome and photos as content", () => {
    expect(projectSignals("en", project()).itemCount).toBe(1); // outcome only
    expect(projectSignals("en", project({ description: "D" })).itemCount).toBe(2);
  });

  it("does NOT count the title — it is NOT NULL and falls back to the slug", () => {
    // Counting it would make every project look populated, including an empty one.
    const empty = project({ description: null, outcome: null, media: [] });
    expect(projectSignals("en", empty).itemCount).toBe(0);
    expect(isIndexable(projectSignals("en", empty))).toBe(false);
  });

  it("counts photos, so a picture-only project is still real content", () => {
    const photos = project({
      description: null,
      outcome: null,
      media: [
        { id: "a", storageKey: "k", mime: "image/jpeg", alt: { en: "A" }, sort: 0 },
        { id: "b", storageKey: "k2", mime: "image/png", alt: { en: "B" }, sort: 1 },
      ],
    });
    expect(projectSignals("en", photos).itemCount).toBe(2);
    expect(isIndexable(projectSignals("en", photos))).toBe(true);
  });

  it("gives the SAME verdict for a detail object and a list row — the anti-drift property", () => {
    // `ProjectDetail extends ProjectListItem`, and the signals deliberately read
    // only fields BOTH shapes carry. If this ever diverges, the page and the
    // sitemap will disagree about the same project — the exact failure the
    // one-predicate rule exists to prevent.
    const listRow = project();
    const detailObject = { ...listRow, products: [{ id: "x" }] } as unknown as ProjectListItem;
    expect(projectSignals("en", detailObject)).toEqual(projectSignals("en", listRow));
  });

  it("is fallback-only on a non-EN locale when the project's own text fell back", () => {
    expect(isIndexable(projectSignals("ru", project({ isFallback: true })))).toBe(false);
    expect(isIndexable(projectSignals("en", project({ isFallback: true })))).toBe(true);
  });
});

/**
 * The grouping (Story 3.1 AC1 — added in the 3.1 review). As a page-private
 * function this had NO test at any level, while the story record claimed the
 * null-industry branch was "unit-level only" proven. Extracted here precisely so
 * these assertions could exist.
 */
describe("groupByIndustry", () => {
  const oil = { slug: "oil-gas", name: "Oil & Gas", isFallback: false };
  const fire = { slug: "fire-safety", name: "Fire Safety", isFallback: false };

  it("groups by industry in first-appearance order", () => {
    const groups = groupByIndustry([
      project({ id: "a", industry: oil }),
      project({ id: "b", slug: "b", industry: fire }),
      project({ id: "c", slug: "c", industry: oil }),
    ]);
    expect(groups.map((g) => g.slug)).toEqual(["oil-gas", "fire-safety"]);
    expect(groups[0]?.items.map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("a NULL-industry project does NOT vanish — it lands in the un-sectored group, LAST", () => {
    // `industry_id` is a nullable FK with onDelete: SetNull, so deleting an
    // industry un-sectors its projects. They must collect, not disappear.
    const groups = groupByIndustry([
      project({ id: "orphan", slug: "orphan", industry: null }),
      project({ id: "a", industry: oil }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[1]?.slug).toBeNull();
    expect(groups[1]?.items.map((p) => p.id)).toEqual(["orphan"]);
    // Sorted last even though it appeared FIRST in the read.
    expect(groups[0]?.slug).toBe("oil-gas");
  });

  it("an industry with no published project is simply never emitted", () => {
    const groups = groupByIndustry([project({ industry: oil })]);
    expect(groups.map((g) => g.slug)).toEqual(["oil-gas"]);
  });

  it("the un-sectored key cannot collide with a real slug — even one literally named 'none'", () => {
    // The sentinel contains a space, which isValidSlug forbids in real slugs. The
    // page previously re-derived `slug ?? "none"` as the React key, which an
    // industry slugged "none" WOULD have collided with (3.1 review).
    const none = { slug: "none", name: "None Industries", isFallback: false };
    const groups = groupByIndustry([
      project({ id: "a", industry: none }),
      project({ id: "b", slug: "b", industry: null }),
    ]);
    expect(groups).toHaveLength(2);
    expect(new Set(groups.map((g) => g.key)).size).toBe(2);
  });

  it("carries the industry's fallback flag so the group heading can be lang-marked", () => {
    const groups = groupByIndustry([
      project({ industry: { slug: "fire-safety", name: "Fire Safety", isFallback: true } }),
    ]);
    expect(groups[0]?.isFallback).toBe(true);
  });

  it("returns [] for zero projects — the page renders its defined empty state", () => {
    expect(groupByIndustry([])).toEqual([]);
  });
});
