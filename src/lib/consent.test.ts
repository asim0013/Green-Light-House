import { describe, it, expect } from "vitest";
import {
  CONSENT_COOKIE,
  parseConsent,
  consentCookieString,
  type ConsentChoice,
} from "./consent";

/**
 * The consent primitive (Story 5.2 — FR46). Pure parse/serialize so it is testable
 * without a DOM; `readConsent`/`writeConsent` are the thin `document.cookie` wrappers.
 */

describe("parseConsent", () => {
  it("reads granted/denied from a document.cookie string", () => {
    expect(parseConsent(`${CONSENT_COOKIE}=granted`)).toBe("granted");
    expect(parseConsent(`NEXT_LOCALE=en; ${CONSENT_COOKIE}=denied`)).toBe("denied");
    expect(parseConsent(`${CONSENT_COOKIE}=denied; other=x`)).toBe("denied");
  });

  it("returns null when absent or not a valid choice (no implicit consent)", () => {
    expect(parseConsent("NEXT_LOCALE=en")).toBeNull();
    expect(parseConsent("")).toBeNull();
    expect(parseConsent(`${CONSENT_COOKIE}=maybe`)).toBeNull(); // garbage ⇒ null ⇒ denied-by-default
  });
});

describe("consentCookieString", () => {
  it("is an essential, Lax, 180-day, path-root cookie", () => {
    const s = consentCookieString("granted", { secure: false });
    expect(s.startsWith(`${CONSENT_COOKIE}=granted`)).toBe(true);
    expect(s).toContain("Path=/");
    expect(s).toContain("SameSite=Lax");
    expect(s).toMatch(/Max-Age=\d{6,}/); // ~180 days
    expect(s).not.toContain("HttpOnly"); // the client analytics loader must read it
  });

  it("adds Secure only over https", () => {
    expect(consentCookieString("denied", { secure: true })).toContain("; Secure");
    expect(consentCookieString("denied", { secure: false })).not.toContain("Secure");
  });

  it("round-trips through parseConsent", () => {
    for (const c of ["granted", "denied"] as ConsentChoice[]) {
      const cookie = consentCookieString(c, { secure: false }).split(";")[0];
      expect(parseConsent(cookie)).toBe(c);
    }
  });
});
