import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render contract for the consent banner (Story 5.2). The SiteHeader.test convention:
 * mock next-intl to echo keys, `@/i18n/navigation` Link to a plain `<a>`. The click
 * behaviour (writes `glh-consent`, hides) is covered by `consent.test.ts` + the e2e;
 * this pins the markup — both equally-prominent actions, the `/cookies` link, the
 * ≥44px floor, and that `initialShow={false}` renders NOTHING (no flash).
 */
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => {
    const p = { ...rest };
    delete p.locale;
    return (
      <a href={href} {...p}>
        {children}
      </a>
    );
  },
}));

const { ConsentBanner } = await import("./ConsentBanner");

describe("ConsentBanner (Story 5.2)", () => {
  it("renders equally-prominent Accept + Decline (≥44px) and a /cookies link when shown", () => {
    const html = renderToStaticMarkup(<ConsentBanner initialShow={true} />);
    expect(html).toContain("accept");
    expect(html).toContain("decline");
    expect(html).toContain('href="/cookies"');
    expect((html.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/role="region"/);
  });

  it("renders NOTHING when initialShow is false (no flash, no layout shift)", () => {
    expect(renderToStaticMarkup(<ConsentBanner initialShow={false} />)).toBe("");
  });
});
