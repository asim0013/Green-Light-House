import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CONSENT_COOKIE, writeConsent } from "@/lib/consent";

/**
 * The consent-gated analytics loader (Story 5.8). jsdom default env. `useLocale` is
 * stubbed; the config module is mocked with a SWITCHABLE `analyticsEnabled` so both
 * gates are tested here — the env gate (outer) and the consent gate (inner). The real
 * config reads an unset NEXT_PUBLIC_ var in tests, which would leave it always off.
 *
 * Review F2/F4/F5 added: the `tel:` listener (it had no test — a broken selector
 * stayed green), the "no storage before consent" guard on `plausible_ignore`, and the
 * env gate itself (the mock used to hard-code `true`, so removing the gate was invisible).
 */
const cfg = vi.hoisted(() => ({ enabled: true }));

vi.mock("next-intl", () => ({ useLocale: () => "en" }));
vi.mock("@/lib/analytics/config", () => ({
  analyticsEnabled: () => cfg.enabled,
  ANALYTICS_DOMAIN: "example.test",
  ANALYTICS_SCRIPT_PATH: "/hive/js/script.js",
  ANALYTICS_EVENT_PATH: "/api/hive/event",
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { Analytics } = await import("./Analytics");

type Win = { plausible?: (n: string, o?: unknown) => void };
const win = () => window as unknown as Win;
const script = () => document.getElementById("glh-plausible");
const PHONE = "+902121234567";

describe("Analytics loader", () => {
  let container: HTMLDivElement;
  let root: Root;
  let sent: Array<[string, unknown]>;

  beforeEach(() => {
    cfg.enabled = true;
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
    script()?.remove();
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
    // A spy in place BEFORE mount: `injectPlausible` keeps an existing
    // `window.plausible`, so every event the loader sends lands here.
    sent = [];
    win().plausible = (n, o) => sent.push([n, o]);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    script()?.remove();
    delete win().plausible;
    document.querySelectorAll("a[data-test-tel]").forEach((a) => a.remove());
  });

  /** A `tel:` link the way the site renders one, clicked like a buyer would. */
  const clickTel = () => {
    const a = document.createElement("a");
    a.href = `tel:${PHONE}`;
    a.setAttribute("data-test-tel", "");
    const icon = document.createElement("span"); // click lands on a CHILD — `closest()` must still match
    a.appendChild(icon);
    a.addEventListener("click", (e) => e.preventDefault()); // jsdom: no navigation
    document.body.appendChild(a);
    act(() => {
      icon.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  };

  it("renders nothing, injects NO script and writes NO storage before consent", () => {
    act(() => root.render(<Analytics />));
    expect(container.innerHTML).toBe("");
    expect(script()).toBeNull();
    // F4: `plausible_ignore` is written only when a loaded script must be stopped.
    expect(localStorage.getItem("plausible_ignore")).toBeNull();
  });

  it("injects NO script and writes NO storage when consent is denied", () => {
    document.cookie = `${CONSENT_COOKIE}=denied; Path=/`;
    act(() => root.render(<Analytics />));
    expect(script()).toBeNull();
    expect(localStorage.getItem("plausible_ignore")).toBeNull();
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

  it("does NOTHING when analytics is unprovisioned, even with consent granted (env gate, F5)", () => {
    cfg.enabled = false;
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    act(() => root.render(<Analytics />));
    expect(script()).toBeNull();
    clickTel();
    expect(sent).toEqual([]);
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

  it("sends ONE Phone event on a tel: click when granted — path+locale, never the number (F2)", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    act(() => root.render(<Analytics />));
    clickTel();
    expect(sent).toEqual([["Phone", { props: { path: location.pathname, locale: "en" } }]]);
    expect(JSON.stringify(sent)).not.toContain(PHONE.slice(1));
  });

  it("sends nothing on a tel: click without consent, or on a non-tel link", () => {
    act(() => root.render(<Analytics />));
    clickTel(); // no choice ⇒ denied
    const other = document.createElement("a");
    other.href = "/en/products";
    other.addEventListener("click", (e) => e.preventDefault());
    document.body.appendChild(other);
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    act(() => {
      other.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    other.remove();
    expect(sent).toEqual([]);
  });
});
