import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * JSX-level tests for the header chrome (Story 1.6 review).
 *
 * The pure `isActivePath` predicate is covered separately; these assert the
 * *wiring* — that the predicate actually reaches `aria-current` in the markup —
 * so a typo or an inverted ternary fails a test. Runs with no server and no DB,
 * which is why the chrome is still proven when the e2e skips on a down database.
 */

let mockPathname = "/";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockPathname,
  Link: ({
    href,
    children,
    ...rest
  }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    // `locale` is a next-intl-only prop; drop it so it doesn't land on the <a>.
    const props = { ...rest };
    delete props.locale;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));

const { SiteHeader } = await import("./SiteHeader");

beforeEach(() => {
  mockPathname = "/";
});

/** Extract the <a> whose text content contains `label`. */
function anchorFor(html: string, label: string): string | undefined {
  return html.match(/<a\b[^>]*>.*?<\/a>/g)?.find((a) => a.includes(`>${label}<`));
}

describe("SiteHeader active state", () => {
  it("marks the matching nav link with aria-current=page", () => {
    mockPathname = "/industries";
    const html = renderToStaticMarkup(<SiteHeader />);
    const link = anchorFor(html, "industries");
    expect(link).toBeDefined();
    expect(link).toContain('aria-current="page"');
  });

  it("keeps a nav item active on a nested sub-path", () => {
    mockPathname = "/industries/oil-gas";
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(anchorFor(html, "industries")).toContain('aria-current="page"');
  });

  it("does not mark non-matching nav links", () => {
    mockPathname = "/industries";
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(anchorFor(html, "products")).not.toContain("aria-current");
  });

  it("marks nothing active on the homepage (not a nav item)", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    for (const key of ["industries", "products", "projects", "services", "about"]) {
      expect(anchorFor(html, key)).not.toContain("aria-current");
    }
  });
});

describe("SiteHeader chrome", () => {
  it("renders the brand, all five nav links, a tel: phone, and the RFQ CTA", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain("GREENLIGHTHOUSE");
    for (const key of ["industries", "products", "projects", "services", "about"]) {
      expect(anchorFor(html, key)).toBeDefined();
    }
    expect(html).toContain('href="tel:');
    expect(html).toContain("requestQuote");
  });

  it("keeps the phone's visible number inside its accessible name (WCAG 2.5.3)", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    const tel = html.match(/<a\b[^>]*href="tel:[^"]*"[^>]*>/)?.[0] ?? "";
    const label = tel.match(/aria-label="([^"]*)"/)?.[1] ?? "";
    expect(label).toContain("+90"); // the visible number is part of the name
  });

  it("exposes the mobile menu element even when collapsed (valid aria-controls)", () => {
    const html = renderToStaticMarkup(<SiteHeader />);
    expect(html).toContain('id="mobile-menu"');
    expect(html).toContain('aria-controls="mobile-menu"');
    expect(html).toContain('aria-expanded="false"');
  });
});
