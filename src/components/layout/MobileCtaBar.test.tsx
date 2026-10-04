import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * JSX-level tests for the sticky mobile CTA bar (Story 5.5). No DB, no server —
 * the SiteHeader.test convention: mock next-intl to echo the key and `@/i18n/navigation`
 * `Link` to a plain `<a>`, then assert the wiring in the rendered markup.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const props = { ...rest };
    delete props.locale;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const { MobileCtaBar } = await import("./MobileCtaBar");

const PHONE = { phone: "+902121234567", phoneDisplay: "+90 212 123 45 67" };

describe("MobileCtaBar (Story 5.5)", () => {
  it("builds the product doorway href for the Request-quote link", () => {
    const html = renderToStaticMarkup(
      <MobileCtaBar doorway="product" slug="fd-9500" phone={PHONE} />,
    );
    expect(html).toContain('href="/rfq?product=fd-9500"');
    expect(html).toContain("requestQuote");
  });

  it("builds the project doorway href when doorway=project", () => {
    const html = renderToStaticMarkup(
      <MobileCtaBar doorway="project" slug="lng-terminal" phone={PHONE} />,
    );
    expect(html).toContain('href="/rfq?project=lng-terminal"');
  });

  it("renders the Call link as tel: with the display number in its accessible name", () => {
    const html = renderToStaticMarkup(<MobileCtaBar doorway="product" slug="x" phone={PHONE} />);
    expect(html).toContain('href="tel:+902121234567"');
    // aria-label carries the human number (WCAG 2.5.3).
    expect(html).toContain("+90 212 123 45 67");
  });

  it("both actions meet the 44px touch floor (min-h-11)", () => {
    const html = renderToStaticMarkup(<MobileCtaBar doorway="product" slug="x" phone={PHONE} />);
    // Two min-h-11 controls: the quote button and the call link.
    expect((html.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("is a labelled landmark, hidden at desktop (lg:hidden) and sticky to the bottom", () => {
    const html = renderToStaticMarkup(<MobileCtaBar doorway="product" slug="x" phone={PHONE} />);
    expect(html).toMatch(/<nav[^>]+aria-label=/);
    expect(html).toContain("lg:hidden");
    expect(html).toContain("sticky");
    // Lifts above the Story 5.2 consent bar when it is open, flush (0px) otherwise
    // (review 5.2 #5). `0px` fallback = bottom-0 behaviour when no bar is present.
    expect(html).toContain("bottom-[var(--glh-consent-h,0px)]");
  });
});
