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

  it("renders a live module (Catalog, shipped in 4.3) as a link", () => {
    // P5: revert nav.ts's catalog `available` to false and this reddens.
    const h = html();
    expect(h).toContain("Catalog");
    expect(h).toContain('href="/admin/catalog"');
  });

  it("renders live modules (Media 4.5, Documents 4.6) as links", () => {
    // P5: revert either `available` to false in nav.ts and this reddens.
    const h = html();
    expect(h).toContain('href="/admin/media"');
    expect(h).toContain('href="/admin/documents"');
  });

  it("renders Settings (shipped in 4.8) as a live link — every module is now live", () => {
    // Settings was the LAST inert module; Story 4.8 flips it live, so as of this
    // story no 'soon' marker remains anywhere in the sidebar.
    // P5: revert Settings' `available` to false in nav.ts and this reddens.
    const h = html();
    expect(h).toContain("Settings");
    expect(h).toContain('href="/admin/settings"');
    expect(h).not.toContain("soon");
  });

  it("logout posts to the Story 4.1 route with the locale", () => {
    const h = html();
    expect(h).toContain('action="/api/admin/logout"');
    expect(h).toContain('value="en"');
  });
});
