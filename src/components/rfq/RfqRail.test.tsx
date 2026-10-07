import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The `/rfq` rail's certification line (launch, 2026-10). It was the literal
 * `ISO 9001 · CE · EN · A.TR` — a factual claim no admin could change or remove,
 * shown on every production database. It now renders the homepage's
 * admin-managed list, and nothing at all when that list is empty.
 */
vi.mock("next-intl", () => ({ useTranslations: () => (k: string) => k }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const { RfqRail } = await import("./RfqRail");

describe("RfqRail certification line", () => {
  it("renders the admin-entered marks, in order", () => {
    const html = renderToStaticMarkup(<RfqRail sla={null} certMarks={["ZZZ-A", "ZZZ-B"]} />);
    expect(html).toContain("ZZZ-A · ZZZ-B");
  });

  it("claims nothing when no marks are entered — no literal, no empty line", () => {
    for (const html of [
      renderToStaticMarkup(<RfqRail sla={null} />),
      renderToStaticMarkup(<RfqRail sla={null} certMarks={[]} />),
    ]) {
      expect(html).not.toContain("ISO 9001");
      expect(html).not.toContain("A.TR");
      // The "why no prices" card ends at its body text — no empty mono line after it.
      expect(html).toContain("whyBody</p></div>");
    }
  });
});
