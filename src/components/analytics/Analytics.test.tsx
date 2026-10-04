import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CONSENT_COOKIE, writeConsent } from "@/lib/consent";

/**
 * The consent-gated analytics loader (Story 5.8). jsdom default env. `useLocale` is
 * stubbed; the config module is mocked ENABLED (the real one reads an unset
 * NEXT_PUBLIC_ var in tests → disabled). We assert the script is injected ONLY on
 * granted consent, never before — and that an Accept AFTER mount loads it live.
 */
vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/analytics/config", () => ({
  analyticsEnabled: () => true,
  ANALYTICS_DOMAIN: "example.test",
  ANALYTICS_SCRIPT_PATH: "/hive/js/script.js",
  ANALYTICS_EVENT_PATH: "/api/hive/event",
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { Analytics } = await import("./Analytics");

const script = () => document.getElementById("glh-plausible");

describe("Analytics loader", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    script()?.remove();
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    script()?.remove();
  });

  it("renders nothing and injects NO script before consent", () => {
    act(() => root.render(<Analytics />));
    expect(container.innerHTML).toBe("");
    expect(script()).toBeNull();
  });

  it("injects NO script when consent is denied", () => {
    document.cookie = `${CONSENT_COOKIE}=denied; Path=/`;
    act(() => root.render(<Analytics />));
    expect(script()).toBeNull();
  });

  it("injects the same-origin cookieless script when consent is granted", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    act(() => root.render(<Analytics />));
    const s = script();
    expect(s).not.toBeNull();
    expect(s!.getAttribute("src")).toBe("/hive/js/script.js");
    expect(s!.getAttribute("data-domain")).toBe("example.test");
    expect(s!.getAttribute("data-api")).toBe("/api/hive/event");
  });

  it("loads live when the visitor Accepts AFTER mount (no reload)", () => {
    act(() => root.render(<Analytics />));
    expect(script()).toBeNull();
    act(() => {
      writeConsent("granted"); // dispatches CONSENT_CHANGED_EVENT
    });
    expect(script()).not.toBeNull();
  });

  it("stops a loaded script live when consent is revoked (plausible_ignore)", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    act(() => root.render(<Analytics />));
    expect(script()).not.toBeNull();
    act(() => {
      writeConsent("denied");
    });
    expect(localStorage.getItem("plausible_ignore")).toBe("true");
  });
});
