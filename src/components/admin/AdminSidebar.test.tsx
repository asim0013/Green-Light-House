import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The admin sidebar (Story 4.2, AC1/AC3). `usePathname` is mocked to `/admin`,
 * so Dashboard is the active item. Proves: the active item is a link marked
 * `aria-current`, an unbuilt module is INERT (no href), the brand + admin email
 * render, and logout posts to the 4.1 route.
 */
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  usePathname: () => "/admin",
}));

const { AdminSidebar } = await import("./AdminSidebar");

const html = () =>
  renderToStaticMarkup(<AdminSidebar adminEmail="aylin@example.com" locale="en" />);

describe("AdminSidebar", () => {
  it("renders the brand and the admin identity", () => {
    const h = html();
    expect(h).toContain("GREENLIGHTHOUSE");
    expect(h).toContain("aylin@example.com");
    expect(h).toContain("Administrator");
  });

  it("makes the active item (Dashboard) a link marked aria-current", () => {
    // P5: point usePathname elsewhere and Dashboard loses aria-current="page".
    const h = html();
    expect(h).toContain('href="/admin"');
    expect(h).toContain('aria-current="page"');
  });

  it("renders an unbuilt module as INERT — no href, a 'soon' marker", () => {
    // P5: flip Catalog's `available` to true (or drop the guard) and this reddens
    // — it would render as a link to /admin/catalog.
    const h = html();
    expect(h).toContain("Catalog");
    expect(h).toContain("soon");
    expect(h).not.toContain('href="/admin/catalog"');
  });

  it("logout posts to the Story 4.1 route with the locale", () => {
    const h = html();
    expect(h).toContain('action="/api/admin/logout"');
    expect(h).toContain('value="en"');
  });
});
