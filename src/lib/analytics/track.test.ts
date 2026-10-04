import { describe, it, expect, beforeEach } from "vitest";
import { trackEvent, EVENT_PHONE } from "./track";
import { CONSENT_COOKIE } from "@/lib/consent";

/**
 * The consent-guarded event sender (Story 5.8). jsdom default env — real cookie jar
 * + a stubbed `window.plausible` to capture what would be sent.
 */
type Call = [string, unknown];

describe("trackEvent", () => {
  let calls: Call[];

  beforeEach(() => {
    calls = [];
    (window as unknown as { plausible?: (n: string, o?: unknown) => void }).plausible = (n, o) =>
      calls.push([n, o]);
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`; // no choice
  });

  it("no-ops with no choice OR an explicit denied (nothing before consent)", () => {
    trackEvent(EVENT_PHONE, { path: "/en", locale: "en" }); // null ⇒ denied
    document.cookie = `${CONSENT_COOKIE}=denied; Path=/`;
    trackEvent(EVENT_PHONE, { path: "/en", locale: "en" });
    expect(calls).toEqual([]);
  });

  it("sends the event with path+locale only when granted — and nothing PII-shaped", () => {
    document.cookie = `${CONSENT_COOKIE}=granted; Path=/`;
    trackEvent(EVENT_PHONE, { path: "/en/products/as-60", locale: "en" });
    expect(calls).toEqual([
      [EVENT_PHONE, { props: { path: "/en/products/as-60", locale: "en" } }],
    ]);
    // Guard: no phone-like digit run ever reaches the payload.
    expect(JSON.stringify(calls)).not.toMatch(/\d{7,}/);
  });
});
