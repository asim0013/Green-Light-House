import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONTACT,
  configuredChannels,
  isFullyConfigured,
  isSupplied,
  mapsUrl,
  type ContactDetails,
} from "./contact";

/**
 * The contact channel module (Story 3.8 — AC1, AC5).
 *
 * ⚠️ `src/config/site.ts` has never had a test file, and the single-source
 * promise this module makes is exactly the kind that decays silently — so it
 * gets one. Everything here is pure: no DB, no network, no locale.
 */

/** A fully-supplied fixture. The shipped `CONTACT` is all-null by design. */
function supplied(over: Partial<ContactDetails> = {}): ContactDetails {
  return {
    email: "inquiries@example.test",
    address: "1 Example Sokak\nBeşiktaş\n34000 İstanbul",
    legal: {
      legalName: "Example Ticaret A.Ş.",
      tradeRegistryNo: "123456",
      taxOffice: "Beşiktaş",
      taxNo: "1234567890",
      mersisNo: "0123456789012345",
    },
    ...over,
  };
}

describe("isSupplied — the ONE definition of configured", () => {
  it("rejects null, empty and whitespace-only", () => {
    // ⚠️ The blank cases matter: a value typed as an empty string in a config
    // edit would otherwise count as configured and render a bare label above
    // nothing — the defect the 3.5 review found on six surfaces.
    // P5: drop the `.trim()` and the whitespace case reddens.
    expect(isSupplied(null)).toBe(false);
    expect(isSupplied(undefined)).toBe(false);
    expect(isSupplied("")).toBe(false);
    expect(isSupplied("   ")).toBe(false);
    expect(isSupplied("\n\t ")).toBe(false);
  });

  it("accepts real values", () => {
    expect(isSupplied("info@example.test")).toBe(true);
  });
});

describe("configuredChannels — partial configuration must work", () => {
  it("is EMPTY for the shipped all-null config", () => {
    // The day-one state. This is what keeps /contact out of the index.
    expect(configuredChannels(CONTACT)).toEqual([]);
  });

  it("returns every channel when everything is supplied", () => {
    expect(configuredChannels(supplied())).toEqual(["email", "address", "legal"]);
  });

  it("⚠️ renders the supplied channel and OMITS the rest — not all-or-nothing", () => {
    // The story's explicit requirement: GLH may supply the email long before the
    // registration numbers. P5: make `configuredChannels` return all channels
    // whenever any is supplied, and this reddens.
    const emailOnly = supplied({ address: null, legal: { ...supplied().legal, legalName: null } });
    expect(configuredChannels(emailOnly)).toEqual(["email"]);
  });

  it("anchors the legal block on the registered NAME, not on the numbers", () => {
    // Numbers without the name they belong to are unattributable, so the block
    // does not render at all. P5: anchor it on `taxNo` instead and this reddens.
    const numbersOnly = supplied({
      legal: { ...supplied().legal, legalName: null },
    });
    expect(configuredChannels(numbersOnly)).not.toContain("legal");

    const nameOnly = supplied({
      legal: {
        legalName: "Example A.Ş.",
        tradeRegistryNo: null,
        taxOffice: null,
        taxNo: null,
        mersisNo: null,
      },
    });
    expect(configuredChannels(nameOnly)).toContain("legal");
  });
});

describe("isFullyConfigured — the REQUIRED set, and why it is not a count", () => {
  it("is false for the shipped config", () => {
    expect(isFullyConfigured(CONTACT)).toBe(false);
  });

  it("is true only when email, address AND the registered name are all present", () => {
    expect(isFullyConfigured(supplied())).toBe(true);
    expect(isFullyConfigured(supplied({ email: null }))).toBe(false);
    expect(isFullyConfigured(supplied({ address: null }))).toBe(false);
    expect(isFullyConfigured(supplied({ legal: { ...supplied().legal, legalName: null } }))).toBe(
      false,
    );
  });

  it("⚠️ is NOT the same as 'has at least one channel' — the distinction is load-bearing", () => {
    // A one-channel page has a non-zero itemCount, so `itemCount` alone would let
    // it index while the address and legal details are still missing. This is the
    // predicate that stops it.
    // P5: define `isFullyConfigured` as `configuredChannels().length > 0` and
    // this reddens — which is precisely the defect a validator caught in the
    // story's first draft.
    const emailOnly = supplied({ address: null, legal: { ...supplied().legal, legalName: null } });
    expect(configuredChannels(emailOnly).length).toBeGreaterThan(0);
    expect(isFullyConfigured(emailOnly)).toBe(false);
  });
});

describe("mapsUrl — derived, never stored", () => {
  it("encodes the address into a plain outbound URL", () => {
    const address = "1 Example Sokak\nBeşiktaş\n34000 İstanbul";
    const url = mapsUrl(address);
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
    // Round-trips: the link cannot drift from the address it was built from.
    // P5: interpolate the raw address without encoding and this reddens on the
    // newlines and the non-ASCII characters.
    expect(decodeURIComponent(url.split("query=")[1])).toBe(address);
  });
});

describe("the single-source promise (AC1)", () => {
  /**
   * ⚠️ THIS GATE IS VACUOUS WHILE THE CONFIG IS ALL-NULL, AND IT SAYS SO.
   *
   * With every value `null` there are no needles, so a sweep would pass over
   * nothing and report a clean repo forever — the vacuous-gate failure this
   * project has shipped before. It therefore asserts its own applicability
   * first and skips with a reason rather than reporting a false green.
   */
  it("no contact VALUE is duplicated into any locale catalogue", (ctx) => {
    const needles = [
      CONTACT.email,
      CONTACT.address,
      CONTACT.legal.legalName,
      CONTACT.legal.tradeRegistryNo,
      CONTACT.legal.taxOffice,
      CONTACT.legal.taxNo,
      CONTACT.legal.mersisNo,
    ].filter(isSupplied);

    if (needles.length === 0) {
      // ⚠️ SKIPPED, NOT PASSED, AND THE DISTINCTION MATTERS. An earlier version
      // of this branch asserted `isFullyConfigured(CONTACT) === false` here and
      // called that "stating the reason out loud" — but with no needles that is
      // a TAUTOLOGY: no supplied values IS what makes the config incomplete, so
      // the assertion could never fail. A green tick for a sweep that examined
      // nothing is precisely the vacuous-gate failure this project keeps finding
      // in other people's work. `ctx.skip()` reports it as skipped, which is
      // visible in the run output and honest about what was checked.
      return ctx.skip();
    }

    const offenders: string[] = [];
    for (const locale of ["en", "tr", "ru"]) {
      const raw = readFileSync(`messages/${locale}.json`, "utf8");
      for (const needle of needles) {
        if (raw.includes(needle)) offenders.push(`${locale}.json: ${needle}`);
      }
    }
    expect(offenders, "a contact VALUE was inlined into a locale catalogue").toEqual([]);
  });
});
