import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CONSENT_COOKIE, readConsent } from "@/lib/consent";

/**
 * Render contract for the consent banner (Story 5.2). The SiteHeader.test convention:
 * mock next-intl to echo keys, `@/i18n/navigation` Link to a plain `<a>`. The markup
 * block pins structure; the interaction block (review 5.2 #8, jsdom `createRoot`)
 * proves Accept→granted / Decline→denied + dismissal at UNIT level, not just e2e.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("ConsentBanner interaction (jsdom)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`; // start with no choice
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const click = (label: string) => {
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === label);
    if (!btn) throw new Error(`no "${label}" button rendered`);
    act(() => {
      btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("Accept writes granted and dismisses the bar", () => {
    act(() => root.render(<ConsentBanner initialShow={true} />));
    expect(container.querySelector('[role="region"]')).not.toBeNull();
    click("accept");
    expect(readConsent()).toBe("granted");
    expect(container.querySelector('[role="region"]')).toBeNull();
  });

  it("Decline writes denied and dismisses the bar", () => {
    act(() => root.render(<ConsentBanner initialShow={true} />));
    click("decline");
    expect(readConsent()).toBe("denied");
    expect(container.querySelector('[role="region"]')).toBeNull();
  });
});
