import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The project facts card (Story 3.1b — AC1, AC7).
 *
 * The behaviour worth pinning is what the card does with an ABSENT value: every
 * row is individually optional, and a missing one must vanish rather than draw a
 * bare label above nothing — the defect the Story 3.5 review found on six
 * surfaces and the Story 3.8 contact page was rebuilt around.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && "count" in values ? `${key}:${values.count}` : key,
  useFormatter: () => ({ dateTime: (d: Date) => `June ${d.getUTCFullYear()}` }),
}));

/**
 * ⚠️ THE BARREL IS LOAD-BEARING HERE. `ProjectFactsCard` imports `Kicker` from
 * `@/components/ui`, whose barrel also re-exports `Breadcrumb` → `@/i18n/navigation`
 * → next-intl's `createNavigation` → `next/navigation`, which does not resolve
 * under Vitest. Stubbed, the convention `ProjectCard.test.tsx` already uses.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
  getPathname: ({ locale, href }: { locale: string; href: string }) => `/${locale}${href}`,
  redirect: () => undefined,
  usePathname: () => "/",
  useRouter: () => ({}),
}));

const { ProjectFactsCard, hasProjectFacts } = await import("./ProjectFactsCard");

import type { ProjectDetail } from "@/server/repositories/project";

function project(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    slug: "lng-terminal-fire-gas-upgrade",
    title: "LNG terminal fire & gas upgrade",
    description: null,
    outcome: null,
    isFallback: false,
    descriptionIsFallback: false,
    outcomeIsFallback: false,
    scope: "Fire & gas detection + suppression",
    scopeIsFallback: false,
    location: "Marmara, Türkiye",
    locationIsFallback: false,
    leadTimeWeeks: 6,
    industry: { slug: "oil-gas", name: "Oil & Gas", isFallback: false },
    deliveredAt: new Date("2024-06-01T00:00:00.000Z"),
    media: [],
    products: [],
    bomLines: [],
    ...over,
  };
}

const EMPTY = project({
  scope: null,
  location: null,
  leadTimeWeeks: null,
  industry: null,
  deliveredAt: null,
});

describe("ProjectFactsCard — an absent value omits its row", () => {
  it("renders every row when every value is present", () => {
    const html = renderToStaticMarkup(<ProjectFactsCard project={project()} />);
    for (const key of [
      "factSector",
      "factLocation",
      "factDelivered",
      "factScope",
      "factLeadTime",
    ]) {
      expect(html, `${key} row missing`).toContain(key);
    }
  });

  it("⛔ omits the LABEL too, not just the value", () => {
    // The failure this forbids is a mono label with empty space beside it.
    // P5: render the row unconditionally and this reddens.
    const html = renderToStaticMarkup(
      <ProjectFactsCard project={project({ location: null, scope: null })} />,
    );
    expect(html).not.toContain("factLocation");
    expect(html).not.toContain("factScope");
    // ...while the rows that DO have values are untouched.
    expect(html).toContain("factSector");
    expect(html).toContain("factLeadTime");
  });

  it("treats leadTimeWeeks 0 as a value, not as absent", () => {
    // A `!project.leadTimeWeeks` guard would silently drop a legitimate zero.
    // P5: change the guard to truthiness and this reddens.
    const html = renderToStaticMarkup(<ProjectFactsCard project={project({ leadTimeWeeks: 0 })} />);
    expect(html).toContain("leadTimeWeeks:0");
  });

  it("renders LEAD TIME through an ICU plural, never as stored prose", () => {
    const html = renderToStaticMarkup(<ProjectFactsCard project={project()} />);
    expect(html).toContain("leadTimeWeeks:6");
  });

  it("hasProjectFacts is false only when EVERY row is absent", () => {
    // The caller uses this to decide whether the card renders at all — an empty
    // bordered box with a kicker and nothing under it is the same defect one
    // level up. P5: make it `&&` instead of `||` and this reddens.
    expect(hasProjectFacts(EMPTY)).toBe(false);
    expect(hasProjectFacts(project())).toBe(true);
    expect(hasProjectFacts(project({ scope: null, location: null, leadTimeWeeks: null }))).toBe(
      true,
    );
  });

  it("marks a fallen-back value with lang, per field", () => {
    // SCOPE and LOCATION fall back independently of the title and of each other.
    const html = renderToStaticMarkup(
      <ProjectFactsCard project={project({ scopeIsFallback: true })} />,
    );
    expect(html).toContain('lang="en"');
  });

  it("uses ink-2 for the mono labels, never muted", () => {
    // `muted` measures 3.10:1 on white — an AA failure at 11px. Same correction
    // Story 3.1 made elsewhere on this page.
    const html = renderToStaticMarkup(<ProjectFactsCard project={project()} />);
    expect(html).not.toContain("text-muted");
  });

  it("⚠️ ships NO CTA — the UX-DR7 departure is deliberate and pinned here", () => {
    // `ProjectCta` already carries the RFQ CTA and a tel: action on this page; a
    // second RFQ region would be duplication. Pinned so a future change that adds
    // one has to confront the decision rather than drift into it — and because
    // adding the canvas's trust line would mount `SlaSummary` and make this a
    // TENTH SLA render site, hard-failing the sla-hygiene discovery self-check.
    const html = renderToStaticMarkup(<ProjectFactsCard project={project()} />);
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("tel:");
  });
});
