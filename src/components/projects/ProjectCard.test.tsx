import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The shared project card (Story 3.1, AC13/AC14 — added in the 3.1 review, which
 * found zero component tests for the four new components).
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    key === "deliveredOn" ? `Delivered ${values?.date}` : key,
  useFormatter: () => ({
    dateTime: (d: Date) => `June ${d.getUTCFullYear()}`,
  }),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { ProjectCard } = await import("./ProjectCard");

import type { ProjectListItem } from "@/server/repositories/project";

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

describe("ProjectCard", () => {
  it("links the title to the project's OWN detail page — bound to the slug", () => {
    const html = renderToStaticMarkup(<ProjectCard project={project()} />);
    expect(html).toContain('href="/projects/lng-terminal-fire-gas-upgrade"');
  });

  it("is an <li>, never an <article> — 23 e2e assertions count articles as ProductCards", () => {
    const html = renderToStaticMarkup(<ProjectCard project={project()} />);
    expect(html.startsWith("<li")).toBe(true);
    expect(html).not.toContain("<article");
  });

  it("heading level is the CONSUMER'S: default h3, h2 on request (the 2.6 axe lesson)", () => {
    expect(renderToStaticMarkup(<ProjectCard project={project()} />)).toContain("<h3");
    expect(renderToStaticMarkup(<ProjectCard project={project()} headingLevel={2} />)).toContain(
      "<h2",
    );
  });

  it("marks ONLY the field that fell back: TR title genuine, outcome from EN (AC2b)", () => {
    const html = renderToStaticMarkup(
      <ProjectCard
        project={project({
          title: "LNG terminali yükseltmesi",
          isFallback: false,
          outcomeIsFallback: true,
        })}
      />,
    );
    // Exactly ONE lang="en" — the outcome span, never the title (counted, not
    // toContain: the 2.6 assertion trap).
    expect(html.match(/lang="en"/g) ?? []).toHaveLength(1);
    const outcomeSpan = html.match(/<span lang="en">[^<]*<\/span>/)?.[0] ?? "";
    expect(outcomeSpan).toContain("142 field devices");
  });

  it("omits the outcome and date rows entirely when absent — no empty shells", () => {
    const html = renderToStaticMarkup(
      <ProjectCard project={project({ outcome: null, deliveredAt: null })} />,
    );
    expect(html).not.toContain("142 field devices");
    expect(html).not.toContain("Delivered");
  });
});
