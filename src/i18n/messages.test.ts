import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { routing } from "./routing";

/**
 * Message-key parity across every locale.
 *
 * A missing key does not fail typecheck, lint, or any render test that only
 * exercises EN — it ships and renders the literal key path to a Turkish or Russian
 * visitor. Story 1.9 added `NotFound.kicker` and `NotFound.backHome` to three
 * files by hand, which is exactly the way this drifts.
 */

type Messages = Record<string, unknown>;

function load(locale: string): Messages {
  return JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Messages;
}

/** Every leaf path, e.g. `NotFound.title`, so nested namespaces are covered too. */
function leafKeys(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Messages).flatMap(([key, child]) =>
    leafKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

const REFERENCE = routing.defaultLocale;

describe("message catalogues", () => {
  const referenceKeys = leafKeys(load(REFERENCE)).sort();

  it("the reference locale is not empty (guards against a vacuous comparison)", () => {
    expect(referenceKeys.length).toBeGreaterThan(10);
  });

  for (const locale of routing.locales.filter((l) => l !== REFERENCE)) {
    it(`${locale}.json has exactly the same keys as ${REFERENCE}.json`, () => {
      const keys = leafKeys(load(locale)).sort();
      expect(
        keys.filter((k) => !referenceKeys.includes(k)),
        `extra keys in ${locale}`,
      ).toEqual([]);
      expect(
        referenceKeys.filter((k) => !keys.includes(k)),
        `missing in ${locale}`,
      ).toEqual([]);
    });

    it(`${locale}.json has no empty values`, () => {
      const messages = load(locale);
      for (const key of leafKeys(messages)) {
        const value = key
          .split(".")
          .reduce<unknown>((acc, part) => (acc as Messages)?.[part], messages);
        expect(typeof value, `${locale}.${key} should be a string`).toBe("string");
        expect(String(value).trim(), `${locale}.${key} is empty`).not.toBe("");
      }
    });
  }
});

/**
 * ICU PLACEHOLDER AND RICH-TAG PARITY (Story 3.4).
 *
 * ⚠️ THE GATE ABOVE WAS TITLED "no empty or placeholder values" AND CHECKED
 * NEITHER — it asserted only that each leaf is a non-empty string, and inspected
 * no `{…}` at all. Its title is corrected above; this is the check it claimed.
 *
 * WHAT IT CATCHES, PROVEN BY EXECUTION rather than assumed:
 *  - A MISSPELLED placeholder name (`{referenc}` for `{reference}`) makes
 *    next-intl throw at render and emit the LITERAL KEY PATH — a Turkish buyer
 *    receives "Rfq.prefillProject" where the sentence should be.
 *  - A DROPPED placeholder silently loses the value: the sentence renders, reads
 *    fine, and simply omits the reference the whole message exists to carry.
 *  - An UNMATCHED rich tag (`<b>` opened, never closed) throws the same way.
 *
 * Nothing else in this repo catches either. Story 3.3's review found exactly
 * this class in the email copy; Story 3.4 renders a composed banner from four
 * per-doorway messages in three locales, which is the same exposure again.
 *
 * The comparison is SET-WISE, not order-wise: a translator may legitimately
 * reorder `{equipment}` and `{industry}` to suit the grammar, and must be able
 * to without failing a gate. What may not change is WHICH tokens appear.
 */
const TOKEN = /\{(\w+)/g;
const RICH_TAG = /<(\/?)(\w+)>/g;

/**
 * ⚠️ PLURAL BRANCH BODIES ARE NOT PLACEHOLDERS, and the first run of this gate
 * proved it by failing on `Catalog.countNoun`:
 *
 *   en  {count, plural, one {product} other {products}}
 *   tr  {count, plural, other {ürün}}
 *   ru  {count, plural, one {позиция} few {позиции} many {позиций} other {позиции}}
 *
 * `{product}` and `{products}` are the EN branch bodies, not arguments — and the
 * branch SET is a property of the language (Turkish has one plural form, Russian
 * has four), so it must differ. Only `count` is an argument here. Branch bodies
 * are stripped before tokenising.
 *
 * HONEST LIMIT: this is a regex, not an ICU parser. It handles the flat
 * `keyword {body}` shape every message in this repo uses; a body containing its
 * own nested argument would need a real parse. If that day comes, the message to
 * read is this comment, not the regex.
 */
const PLURAL_BRANCH = /(?:\b(?:zero|one|two|few|many|other)|=\d+)\s*\{[^{}]*\}/g;

/**
 * Does this message actually CONTAIN an ICU plural/select construct?
 *
 * ⚠️ TWO HOLES IN THE FIRST VERSION OF THIS GATE, both found by its own review.
 *
 * (1) `zero|one|two|few|many|other` are ORDINARY ENGLISH WORDS. Applied
 * unconditionally, the strip ate plain prose: `"Choose one {option}"` had
 * `one {option}` removed as though it were a branch, so `{option}` was never
 * tokenised — and a `tr.json` that DROPPED `{option}` compared [] to [] and
 * passed. A gate that silently stops counting the thing it exists to count is
 * worse than no gate. Stripping now happens only inside a message that really
 * has a plural/select construct.
 *
 * (2) The `=\d+` alternative was UNREACHABLE. `\b` gated the whole group, and
 * between a space and `=` there is no word boundary, so `=0 {none}` was never
 * stripped and its body was mis-read as a placeholder. The `\b` now scopes only
 * to the keyword alternatives, where it belongs.
 *
 * HONEST LIMIT, unchanged: this is a regex, not an ICU parser. A message that
 * mixes a real plural construct with prose containing `one {…}` would still
 * over-strip, and a branch body carrying its own nested argument needs a real
 * parse. If that day comes, the message to read is this comment, not the regex.
 */
const HAS_PLURAL_CONSTRUCT = /\{\s*\w+\s*,\s*(?:plural|select|selectordinal)\s*,/;

function tokensOf(value: string): string[] {
  const body = HAS_PLURAL_CONSTRUCT.test(value) ? value.replace(PLURAL_BRANCH, "") : value;
  return [...body.matchAll(TOKEN)].map((match) => match[1]).sort();
}

/** The DISTINCT rich-tag names in a message, for set comparison. */
function tagsOf(value: string): string[] {
  return [...new Set([...value.matchAll(RICH_TAG)].map((match) => match[2]))].sort();
}

function tagBalanceOf(value: string): Record<string, number> {
  const balance: Record<string, number> = {};
  for (const [, closing, tag] of value.matchAll(RICH_TAG)) {
    balance[tag] = (balance[tag] ?? 0) + (closing ? -1 : 1);
  }
  return balance;
}

describe("the branch-stripper itself — the gate's own instrument (3.4 review)", () => {
  /**
   * ⚠️ THESE TEST THE GATE, NOT THE MESSAGES, and that is deliberate: both holes
   * the review found in `tokensOf` are LATENT against today's message files. No
   * shipped string mixes prose with a branch-like word, and none uses `=0`, so
   * neither bug could be reddened by any fixture — which is precisely why they
   * survived. An instrument whose faults are invisible to the data it inspects
   * has to be tested directly.
   */
  it("does NOT strip prose that merely contains a branch-like word", () => {
    // The hole: `one` is an ordinary English word. Under the first version this
    // returned [] — so a locale that DROPPED `{option}` compared [] to [] and
    // passed the gate that exists to catch exactly that.
    expect(tokensOf("Choose one {option}")).toEqual(["option"]);
    expect(tokensOf("We keep {many} other {records}")).toEqual(["many", "records"]);
  });

  it("DOES strip real plural branch bodies, keeping only the argument", () => {
    expect(tokensOf("{count, plural, one {product} other {products}}")).toEqual(["count"]);
    // Russian's four branches and Turkish's one must compare equal — the branch
    // SET is a property of the language, which is what the stripping is for.
    expect(tokensOf("{count, plural, other {ürün}}")).toEqual(["count"]);
  });

  it("strips an =N branch body — the alternative that was unreachable", () => {
    // `\b=0` can never match: between a space and `=` there is no word boundary.
    // Before the fix this returned ["count", "none"] and any locale with a
    // different branch set failed as a FALSE POSITIVE.
    expect(tokensOf("{count, plural, =0 {none} other {some}}")).toEqual(["count"]);
  });

  it("compares rich tags as a SET, so a rename is visible", () => {
    expect(tagsOf("<ref>{reference}</ref>")).toEqual(["ref"]);
    expect(tagsOf("<reference>{reference}</reference>")).not.toEqual(tagsOf("<ref>x</ref>"));
  });
});

describe("ICU placeholders and rich tags survive translation", () => {
  const reference = load(REFERENCE);
  const referenceLeaves = leafKeys(reference);

  function valueAt(messages: Messages, key: string): unknown {
    return key.split(".").reduce<unknown>((acc, part) => (acc as Messages)?.[part], messages);
  }

  for (const locale of routing.locales.filter((l) => l !== REFERENCE)) {
    it(`${locale}.json carries the SAME placeholder set as ${REFERENCE}.json`, () => {
      const messages = load(locale);
      for (const key of referenceLeaves) {
        const expected = valueAt(reference, key);
        const actual = valueAt(messages, key);
        if (typeof expected !== "string" || typeof actual !== "string") continue;
        expect(tokensOf(actual), `${locale}.${key} placeholder set differs`).toEqual(
          tokensOf(expected),
        );
      }
    });

    it(`${locale}.json leaves every rich tag balanced`, () => {
      const messages = load(locale);
      for (const key of leafKeys(messages)) {
        const value = valueAt(messages, key);
        if (typeof value !== "string") continue;
        for (const [tag, balance] of Object.entries(tagBalanceOf(value))) {
          expect(balance, `${locale}.${key} leaves <${tag}> unbalanced`).toBe(0);
        }
      }
    });

    it(`${locale}.json carries the SAME rich-tag set as ${REFERENCE}.json`, () => {
      // ⚠️ BALANCE IS NOT PARITY, and the check above only tested balance (found
      // by this gate's own review). A translator who renamed `<b>` to `<strong>`
      // left it perfectly balanced — and next-intl resolves rich tags by NAME
      // against the handlers the call site passes, so the renamed tag has no
      // handler and the buyer reads the literal key path. That is the exact
      // failure this whole file exists to prevent, slipping through the half of
      // the gate that was supposed to catch it.
      const messages = load(locale);
      for (const key of referenceLeaves) {
        const expected = valueAt(reference, key);
        const actual = valueAt(messages, key);
        if (typeof expected !== "string" || typeof actual !== "string") continue;
        expect(tagsOf(actual), `${locale}.${key} rich-tag set differs`).toEqual(tagsOf(expected));
      }
    });
  }
});
