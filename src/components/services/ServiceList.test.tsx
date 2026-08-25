import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ServiceListItem } from "@/server/repositories/service";

/**
 * `ServiceList` — the shared service-item treatment (Story 2.6, hardened by its review).
 *
 * This component had NO direct test until the review. Two of its behaviours are
 * exactly the kind that break silently:
 *
 *   - **The heading level belongs to the consuming surface.** It was hard-coded
 *     `<h3>`, correct under `IndustrySection`'s `<h2>` but not on `/services`,
 *     where it produced an `h1 → h3×5 → h2` outline — the CTA outranking the
 *     content. Nothing rendered this component in a test, so nothing noticed.
 *   - **The visible `FallbackNotice` (FR34a).** The e2e assertion that claimed to
 *     cover it actually matched the NAME span's `lang` attribute; the notice is a
 *     sibling carrying no `lang`, so deleting it left the whole suite green — on
 *     this surface and, since the component is shared, on the industry pages too.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

const { ServiceList } = await import("./ServiceList");

function service(over: Partial<ServiceListItem> = {}): ServiceListItem {
  return {
    id: "svc-1",
    slug: "technical-selection",
    name: "Technical selection",
    description: "Specification-led product selection.",
    isFallback: false,
    ...over,
  };
}

describe("ServiceList heading level", () => {
  it("defaults to h3 — the level it sits at under IndustrySection's h2", () => {
    const html = renderToStaticMarkup(<ServiceList services={[service()]} />);
    expect(html).toContain("<h3");
    expect(html).not.toContain("<h2");
  });

  it("renders h2 when the surface has no section header above it (/services)", () => {
    const html = renderToStaticMarkup(<ServiceList services={[service()]} headingLevel={2} />);
    expect(html).toContain("<h2");
    expect(html).not.toContain("<h3");
  });

  it("keeps the same classes at either level — only the tag changes", () => {
    const three = renderToStaticMarkup(<ServiceList services={[service()]} />);
    const two = renderToStaticMarkup(<ServiceList services={[service()]} headingLevel={2} />);
    expect(two.replace(/h2/g, "h3")).toBe(three);
  });
});

describe("ServiceList fallback marking (FR34a)", () => {
  it("marks a fallen-back row with BOTH lang and the visible notice", () => {
    const html = renderToStaticMarkup(<ServiceList services={[service({ isFallback: true })]} />);
    // COUNTED, not `toContain`. Name and description each carry their own `lang`,
    // so a bare `toContain('lang="en"')` stays green when either one is deleted —
    // measured: dropping it from the name span left this test passing. That is the
    // exact defect the review found in the e2e assertion, reproduced here.
    expect(html.match(/lang="en"/g) ?? []).toHaveLength(2);
    // The notice renders the `shownInEnglish` key (stubbed to the key itself here).
    // This is the assertion the e2e comment claimed to make and did not.
    expect(html).toContain("shownInEnglish");
  });

  it("marks the NAME specifically, not just somewhere on the card", () => {
    const html = renderToStaticMarkup(
      <ServiceList services={[service({ isFallback: true, description: null })]} />,
    );
    // Description null, so the only `lang` that can appear is the name's.
    expect(html).toContain('<span lang="en">Technical selection</span>');
  });

  it("marks neither when the row resolved in the requested locale", () => {
    const html = renderToStaticMarkup(<ServiceList services={[service()]} />);
    expect(html).not.toContain('lang="en"');
    expect(html).not.toContain("shownInEnglish");
  });
});

describe("ServiceList content", () => {
  it("renders every service, and omits the paragraph when description is null", () => {
    const html = renderToStaticMarkup(
      <ServiceList
        services={[
          service({ id: "a", slug: "logistics", name: "Logistics & delivery" }),
          service({ id: "b", slug: "tender-support", name: "Tender support", description: null }),
        ]}
      />,
    );
    expect(html).toContain("Logistics &amp; delivery");
    expect(html).toContain("Tender support");
    expect((html.match(/<li/g) ?? []).length).toBe(2);
    // One description paragraph, not two — the null row renders no <p>.
    expect((html.match(/<p/g) ?? []).length).toBe(1);
  });

  it("renders nothing at all with zero services — the consumer owns the empty state", () => {
    expect(renderToStaticMarkup(<ServiceList services={[]} />)).toBe("");
  });
});
