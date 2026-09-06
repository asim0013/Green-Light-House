import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  CONTACT,
  configuredChannels,
  reachChannels,
  suppliedValue,
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
 *
 * ⚠️ NOTHING HERE PINS TODAY'S EMPTINESS. An earlier version asserted
 * `configuredChannels(CONTACT)).toEqual([])` and `isFullyConfigured(CONTACT))
 * .toBe(false)` directly, so the day GLH supplied the values this suite went RED
 * for no defect — while the story, the commit message and the config docstring
 * all promised the opposite. Assertions about the SHIPPED constant are now
 * written so they hold in both states; the behavioural claims are made against
 * fixtures, where both directions are reachable.
 */

/** A fully-supplied, fully-approved fixture. The shipped `CONTACT` is all-null. */
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
    approvals: { legalReviewed: true, translationsReviewed: true },
    ...over,
  };
}

/** The values supplied, both human gates still open — the realistic mid-state. */
function suppliedUnapproved(over: Partial<ContactDetails> = {}): ContactDetails {
  return supplied({
    approvals: { legalReviewed: false, translationsReviewed: false },
    ...over,
  });
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
  it("returns every channel when everything is supplied AND approved", () => {
    expect(configuredChannels(supplied())).toEqual(["email", "address", "legal"]);
  });

  it("returns nothing for an all-null config", () => {
    // Stated against a FIXTURE, not against `CONTACT`: the behaviour under test
    // is "no values ⇒ no channels", which is a property of the function and must
    // stay assertable after GLH supplies the real values.
    const empty: ContactDetails = {
      email: null,
      address: null,
      legal: {
        legalName: null,
        tradeRegistryNo: null,
        taxOffice: null,
        taxNo: null,
        mersisNo: null,
      },
      approvals: { legalReviewed: false, translationsReviewed: false },
    };
    expect(configuredChannels(empty)).toEqual([]);
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

describe("⛔ the human gates — values alone do not publish the page", () => {
  /**
   * The critical finding of the Story 3.8 review, in test form.
   *
   * Two pre-launch obligations were written down in the planning record and
   * neither was reachable from any predicate: filling five values flipped all
   * three locales to `index, follow` and into `sitemap.xml`, silently, over
   * `prd.md:186`'s qualified legal review and `owner-actions.md` §3(b)'s native
   * TR/RU copy review. These are the assertions that would have caught it.
   */
  it("withholds the legal block until it has passed legal review — RENDER, not just index", () => {
    // ⛔ Gating this on indexing would have been useless: a `noindex` page is
    // still public and still footer-linked, so `noindex` withholds a disclosure
    // from nobody. P5: move the `legalReviewed` term out of `configuredChannels`
    // and into `isFullyConfigured` and this reddens.
    const values = suppliedUnapproved();
    expect(configuredChannels(values)).not.toContain("legal");
    expect(configuredChannels(values)).toEqual(["email", "address"]);

    const cleared = suppliedUnapproved({
      approvals: { legalReviewed: true, translationsReviewed: false },
    });
    expect(configuredChannels(cleared)).toContain("legal");
  });

  it("stays unpublishable while the TR/RU copy is unreviewed, however complete the values are", () => {
    // P5: drop the `translationsReviewed` term from `isFullyConfigured` and this
    // reddens — which is exactly how the page shipped able to publish itself.
    const everythingButTranslations = supplied({
      approvals: { legalReviewed: true, translationsReviewed: false },
    });
    expect(configuredChannels(everythingButTranslations)).toEqual(["email", "address", "legal"]);
    expect(isFullyConfigured(everythingButTranslations)).toBe(false);
  });

  it("⚠️ a VALUES-ONLY edit publishes nothing — both gates must be ticked deliberately", () => {
    expect(isFullyConfigured(suppliedUnapproved())).toBe(false);
    expect(
      isFullyConfigured(
        suppliedUnapproved({ approvals: { legalReviewed: true, translationsReviewed: true } }),
      ),
    ).toBe(true);
  });

  it("ships with both gates closed", () => {
    // The one assertion about the shipped constant that is SAFE to pin, because
    // flipping either of these is a deliberate act with a named obligation
    // behind it — not the values-only edit `owner-actions.md` §2 describes.
    expect(CONTACT.approvals.legalReviewed).toBe(false);
    expect(CONTACT.approvals.translationsReviewed).toBe(false);
  });
});

describe("isFullyConfigured — the REQUIRED set, and why it is not a count", () => {
  it("is true only when email, address, the registered name AND both gates are present", () => {
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

  it("agrees with the shipped constant in whatever state it is in", () => {
    // Derived, not pinned: holds on day one AND after GLH delivers.
    const channels = configuredChannels(CONTACT);
    const complete =
      channels.includes("email") &&
      channels.includes("address") &&
      channels.includes("legal") &&
      CONTACT.approvals.translationsReviewed;
    expect(isFullyConfigured(CONTACT)).toBe(complete);
  });
});

describe("suppliedValue — decide and emit cannot diverge", () => {
  it("trims the ENDS of a supplied value", () => {
    // ⚠️ THE SPLIT THIS CLOSES. `isSupplied` has always trimmed to DECIDE, while
    // every render path emitted the RAW value — invisible while the config is
    // all-null, and real the moment GLH pastes an address or a mailbox with a
    // leading space, which is what `owner-actions.md` §2 asks them to do.
    // P5: return `value` instead of `value.trim()` and this reddens.
    expect(suppliedValue("  info@example.test  ")).toBe("info@example.test");
    expect(suppliedValue("\n1 Example Sokak\n")).toBe("1 Example Sokak");
  });

  it("preserves INTERIOR whitespace — the address is newline-separated by design", () => {
    expect(suppliedValue("  1 Example Sokak\nBeşiktaş  ")).toBe("1 Example Sokak\nBeşiktaş");
  });

  it("returns null for everything isSupplied rejects", () => {
    expect(suppliedValue(null)).toBeNull();
    expect(suppliedValue(undefined)).toBeNull();
    expect(suppliedValue("   ")).toBeNull();
  });

  it("a padded address produces a CLEAN maps query", () => {
    // The end-to-end consequence: without trimming, the query begins with
    // encoded blanks and the link is subtly wrong for every visitor.
    const url = mapsUrl(suppliedValue("  1 Example Sokak  ")!);
    expect(url).toContain("query=1%20Example%20Sokak");
    expect(url).not.toContain("query=%20");
  });
});

describe("reachChannels — a disclosure is not a way to reach anyone", () => {
  it("excludes the legal block, which is a disclosure and not a channel", () => {
    // ⚠️ WHY THIS EXISTS. With ONLY the registered name supplied,
    // `configuredChannels` is `["legal"]` — so the zone rendered, and the
    // section kicker "Ways to reach us" headed a block offering no way to reach
    // anyone. The block still renders (GLH supplied it deliberately, and it
    // carries its own "Company details" label); the misdescribing heading does
    // not. P5: drop the filter and this reddens.
    const legalOnly = supplied({ email: null, address: null });
    expect(configuredChannels(legalOnly)).toEqual(["legal"]);
    expect(reachChannels(legalOnly)).toEqual([]);
  });

  it("keeps every channel a buyer can actually use", () => {
    expect(reachChannels(supplied())).toEqual(["email", "address"]);
    expect(reachChannels(supplied({ address: null }))).toEqual(["email"]);
  });
});

describe("mapsUrl — derived, never stored", () => {
  it("PERCENT-ENCODES the address into a plain outbound URL", () => {
    const address = "1 Example Sokak\nBeşiktaş\n34000 İstanbul";
    const url = mapsUrl(address);
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);

    const query = url.split("query=")[1];

    // ⚠️ ASSERTED ON THE ENCODED FORM, AND THE PREVIOUS VERSION COULD NOT FAIL.
    // It asserted `decodeURIComponent(query) === address` and claimed in a
    // comment that dropping `encodeURIComponent` would redden it. It would not:
    // with the raw address interpolated, `query` IS the address, and
    // `decodeURIComponent` leaves newlines and non-ASCII untouched — so the
    // round-trip succeeds and the test passes on the broken code. This was the
    // ONLY guard on AC3's one artifact.
    // P5: drop `encodeURIComponent` from `mapsUrl` and the two assertions below
    // both redden — verified, not asserted.
    expect(query).not.toContain("\n");
    expect(query).toContain("%0A");
    expect(query).toBe(encodeURIComponent(address));

    // ...and it still round-trips, so the link cannot drift from its address.
    expect(decodeURIComponent(query)).toBe(address);
  });

  it("encodes the characters that would otherwise break the query string", () => {
    // `&` would start a new parameter, `#` would truncate to a fragment, and a
    // space would end the URL in some parsers.
    const url = mapsUrl("A & B #3, Kat 2");
    const query = url.split("query=")[1];
    expect(query).not.toMatch(/[&# ]/);
    expect(decodeURIComponent(query)).toBe("A & B #3, Kat 2");
  });
});

describe("the single-source promise (AC1)", () => {
  /**
   * Two gates, because the obvious one is vacuous on day one.
   *
   * The value sweep below can only run once GLH has supplied something. The
   * LABEL-SHAPE gate above it works from day one, and it guards the same
   * property from the side that is actually reachable today: the `Contact`
   * namespace holds LABELS ONLY, so a value inlined into a catalogue is
   * detectable by its shape before any value exists to search for.
   */
  it("the Contact namespace contains labels ONLY — no value-shaped string", () => {
    // ⚠️ THIS IS THE GATE THAT CAN FAIL TODAY. The value sweep below skips while
    // the config is empty, which is honest but leaves the single-source promise
    // unguarded for exactly as long as it is easiest to break: someone adding
    // `"emailLabel": "Inquiries — info@greenlighthouse.com.tr"` to en.json ships
    // an address that `src/config/contact.ts` has never seen and that the other
    // two catalogues will contradict.
    // P5: add an `@`-bearing or long-digit value to any `Contact` key and this
    // reddens — verified in all three catalogues.
    const offenders: string[] = [];
    for (const locale of ["en", "tr", "ru"]) {
      const catalogue = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      for (const [key, value] of Object.entries(catalogue.Contact as Record<string, string>)) {
        if (value.includes("@")) offenders.push(`${locale}.json Contact.${key}: contains "@"`);
        if (/\d{6,}/.test(value)) {
          offenders.push(`${locale}.json Contact.${key}: contains a 6+ digit run`);
        }
      }
    }
    expect(offenders, "a contact VALUE was written into a Contact LABEL").toEqual([]);
  });

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
      // ⚠️ MATCHED AGAINST PARSED VALUES, NOT THE RAW FILE TEXT, AND THE
      // PREVIOUS VERSION COULD NEVER HAVE MATCHED THE ADDRESS. `CONTACT.address`
      // is newline-separated by design; in the file those newlines are the two
      // characters `\` `n`, so a `raw.includes(address)` substring test on a
      // multi-line needle is unsatisfiable — the single most important value to
      // catch was the one value this gate structurally could not see.
      const catalogue = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      const strings: string[] = [];
      const walk = (node: unknown) => {
        if (typeof node === "string") strings.push(node);
        else if (node && typeof node === "object") Object.values(node).forEach(walk);
      };
      walk(catalogue);

      for (const needle of needles) {
        // Compared line by line: an address inlined into a catalogue would be
        // re-flowed onto one line, so whole-string equality would miss it.
        const parts = needle
          .split("\n")
          .map((p) => p.trim())
          .filter(Boolean);
        for (const part of parts) {
          if (strings.some((s) => s.includes(part))) offenders.push(`${locale}.json: ${part}`);
        }
      }
    }
    expect(offenders, "a contact VALUE was inlined into a locale catalogue").toEqual([]);
  });
});
