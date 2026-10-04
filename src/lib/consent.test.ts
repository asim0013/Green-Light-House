import { describe, it, expect, beforeEach } from "vitest";
import {
  CONSENT_COOKIE,
  parseConsent,
  consentCookieString,
  readConsent,
  writeConsent,
  isSecureContext,
  isConsentChoice,
  type ConsentChoice,
} from "./consent";

/**
 * The consent primitive (Story 5.2 — FR46). Pure parse/serialize + the
 * `document.cookie` wrappers. The vitest default env is jsdom (vitest.config.mts),
 * so `readConsent`/`writeConsent` are exercised against a real cookie jar here
 * (review 5.2 #2 — these were previously untested).
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

describe("isConsentChoice", () => {
  it("accepts only the two exact literals", () => {
    expect(isConsentChoice("granted")).toBe(true);
    expect(isConsentChoice("denied")).toBe(true);
    for (const v of [undefined, null, "", "GRANTED", "granted ", "maybe", 1]) {
      expect(isConsentChoice(v)).toBe(false);
    }
  });
});

describe("consentCookieString", () => {
  it("is an essential, Lax, 180-day, path-root cookie", () => {
    const s = consentCookieString("granted", { secure: false });
    expect(s.startsWith(`${CONSENT_COOKIE}=granted`)).toBe(true);
    // Exact, not a prefix: `Path=/admin` must NOT satisfy this (review 5.2 #7).
    expect(s).toContain("; Path=/;");
    expect(s).toContain("; SameSite=Lax");
    expect(s).toContain("; Max-Age=15552000"); // exactly 180 days — a 10-year value must fail
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

describe("isSecureContext", () => {
  it("is true only for https", () => {
    expect(isSecureContext("https:")).toBe(true);
    expect(isSecureContext("http:")).toBe(false);
    expect(isSecureContext(undefined)).toBe(false);
  });
});

describe("readConsent / writeConsent (jsdom cookie jar)", () => {
  beforeEach(() => {
    // Expire any prior value so each case starts from "no choice".
    document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
  });

  it("returns null when nothing is stored (no implicit consent)", () => {
    expect(readConsent()).toBeNull();
  });

  it("persists a choice that readConsent then returns", () => {
    writeConsent("granted");
    expect(readConsent()).toBe("granted");
    writeConsent("denied");
    expect(readConsent()).toBe("denied");
  });
});
