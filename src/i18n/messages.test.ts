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

    it(`${locale}.json has no empty or placeholder values`, () => {
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
