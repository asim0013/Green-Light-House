import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The project image band (Story 3.1 AC11/AC12 — added in the 3.1 review, which
 * found ZERO component tests for the four new components and, specifically, that
 * AC11's own flagged branch — an empty resolved alt falling through to the
 * designed no-photo band — was tested nowhere).
 */

vi.mock("next-intl", () => ({
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) => {
    if (key === "chipDelivered") return `${values?.industry} · Delivered ${values?.year}`;
    if (key === "chipYear") return `Delivered ${values?.year}`;
    if (key === "figCaption") return "FIG. — PROJECT REFERENCE";
    return `${ns}.${key}`;
  },
  useFormatter: () => ({
    dateTime: (d: Date, opts?: { year?: string }) =>
      opts?.year === "numeric" && !("month" in (opts ?? {}))
        ? String(d.getUTCFullYear())
        : d.toISOString(),
  }),
}));

const { ProjectMediaBand } = await import("./ProjectMediaBand");

import type { ProjectListItem } from "@/server/repositories/project";

function project(over: Partial<ProjectListItem> = {}): ProjectListItem {
  return {
    id: "p1",
    slug: "hospital-fire-suppression",
    title: "Hospital clean-agent suppression",
    description: null,
    outcome: null,
    isFallback: false,
    descriptionIsFallback: false,
    outcomeIsFallback: false,
    scope: null,
    scopeIsFallback: false,
    location: null,
    locationIsFallback: false,
    leadTimeWeeks: null,
    industry: { slug: "fire-safety", name: "Fire Safety", isFallback: false },
    deliveredAt: new Date("2023-09-01T00:00:00.000Z"),
    media: [],
    ...over,
  };
}

const PHOTO = {
  id: "overview",
  storageKey: "projects/hospital-fire-suppression/overview.png",
  mime: "image/png" as const,
  alt: { en: "Suppression skid in the plant room" },
  sort: 0,
};

describe("ProjectMediaBand — the photo branch", () => {
  it("renders the first photo through the frozen delivery URL", () => {
    const html = renderToStaticMarkup(
      <ProjectMediaBand project={project({ media: [PHOTO] })} locale="en" />,
    );
    // next/image wraps the src in the optimizer URL even in a static render, so
    // the frozen URL appears URL-ENCODED inside the `url=` param — which is the
    // honest assertion: it proves the frozen path survives the wrapping.
    expect(html).toContain("url=%2Fapi%2Fprojects%2Fhospital-fire-suppression%2Fmedia%2Foverview");
    expect(html).toContain('alt="Suppression skid in the plant room"');
    // No FIG caption when a real photo renders.
    expect(html).not.toContain("FIG.");
  });

  it("resolves a per-locale alt and does NOT mark it", () => {
    const html = renderToStaticMarkup(
      <ProjectMediaBand
        project={project({ media: [{ ...PHOTO, alt: { en: "EN alt", tr: "TR alt" } }] })}
        locale="tr"
      />,
    );
    expect(html).toContain('alt="TR alt"');
    expect(html).not.toContain('lang="en"');
  });

  it("falls back a MISSING locale alt to EN, marked lang=en", () => {
    const html = renderToStaticMarkup(
      <ProjectMediaBand project={project({ media: [PHOTO] })} locale="ru" />,
    );
    expect(html).toContain('alt="Suppression skid in the plant room"');
    expect(html).toContain('lang="en"');
  });

  it("treats a present-but-EMPTY locale alt as absent and falls back to EN (3.1 review)", () => {
    // `"" ?? en` returns "" — the nullish-coalescing hole that HID the photo on
    // that locale only, contradicting the frozen contract that EN alt is the
    // fallback source. The photo must render, with the EN alt, marked.
    const html = renderToStaticMarkup(
      <ProjectMediaBand
        project={project({ media: [{ ...PHOTO, alt: { en: "EN alt", tr: "   " } }] })}
        locale="tr"
      />,
    );
    expect(html).toContain('alt="EN alt"');
    // Encoded — see the frozen-URL note above.
    expect(html).toContain("url=%2Fapi%2Fprojects%2F");
  });
});

describe("ProjectMediaBand — the designed no-photo branch (AC11's flagged case)", () => {
  it("renders the FIG band, not a blank region, when media is empty", () => {
    const html = renderToStaticMarkup(<ProjectMediaBand project={project()} locale="en" />);
    expect(html).toContain("FIG.");
    expect(html).toContain("Fire Safety · Delivered 2023");
    expect(html).not.toContain("<img");
  });

  it("falls through to the FIG band when the ONLY photo's resolved alt is empty", () => {
    // An empty alt renders <img alt=""> — a project photo announced as decorative.
    // Treated as a data defect: the drawn no-photo state is the honest render.
    const html = renderToStaticMarkup(
      <ProjectMediaBand
        project={project({ media: [{ ...PHOTO, alt: { en: "  " } }] })}
        locale="en"
      />,
    );
    expect(html).not.toContain("<img");
    expect(html).toContain("FIG.");
  });

  it("composes the chip from whole messages: industry-only and year-only both work", () => {
    const noDate = renderToStaticMarkup(
      <ProjectMediaBand project={project({ deliveredAt: null })} locale="en" />,
    );
    expect(noDate).toContain("Fire Safety");
    expect(noDate).not.toContain("Delivered");

    const noIndustry = renderToStaticMarkup(
      <ProjectMediaBand project={project({ industry: null })} locale="en" />,
    );
    expect(noIndustry).toContain("Delivered 2023");
  });

  it("marks the chip lang=en when the industry NAME fell back (3.1 review)", () => {
    const html = renderToStaticMarkup(
      <ProjectMediaBand
        project={project({
          industry: { slug: "fire-safety", name: "Fire Safety", isFallback: true },
        })}
        locale="ru"
      />,
    );
    const chip = html.match(/<p[^>]*>[^<]*Fire Safety[^<]*<\/p>/)?.[0] ?? "";
    expect(chip).toContain('lang="en"');
  });
});
