import { describe, it, expect } from "vitest";
import { toSpecRows, humanizeSpecKey, toProductCardItem, type ProductCardRow } from "./product";

/**
 * Spec-row derivation for the Product Card (Story 2.1).
 *
 * `Product.attributes` is `Json @default("{}")` — content-defined JSONB with no
 * schema and no translation model. An admin (Epic 4) or a CSV import (Story 4.10)
 * can put anything in it, so this function is the boundary that keeps arbitrary
 * content out of the render path. The failure it exists to prevent is silent:
 * an object-valued attribute stringified into "[object Object]" on a public page.
 */

describe("toSpecRows", () => {
  it("derives label/value rows from a flat attribute object", () => {
    expect(toSpecRows({ detection: "Triple-IR (IR³)", response: "< 5 s" })).toEqual([
      { label: "Detection", value: "Triple-IR (IR³)" },
      { label: "Response", value: "< 5 s" },
    ]);
  });

  it("caps the rows at two (EXPERIENCE.md: the card shows two spec lines)", () => {
    const rows = toSpecRows({
      hazArea: "ATEX Zone 1",
      response: "< 5 s",
      detection: "Triple-IR",
      enclosure: "IP66 / IP67",
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.label)).toEqual(["Detection", "Enclosure"]);
  });

  it("sorts by key, so the result does not depend on insertion order", () => {
    // Measured: Postgres jsonb reorders keys (by length, then bytewise), so a card
    // whose two rows came from `Object.entries` order would show DIFFERENT specs
    // depending on how the row happened to be stored.
    const written = toSpecRows({ detection: "d", enclosure: "e", response: "r" }, 3);
    const readBack = toSpecRows({ response: "r", detection: "d", enclosure: "e" }, 3);
    expect(readBack).toEqual(written);
    expect(written.map((r) => r.label)).toEqual(["Detection", "Enclosure", "Response"]);
  });

  it("honours an explicit max", () => {
    expect(toSpecRows({ a: "1", b: "2", c: "3" }, 3)).toHaveLength(3);
  });

  it("keeps numeric values, rendered as strings", () => {
    expect(toSpecRows({ version: 4 })).toEqual([{ label: "Version", value: "4" }]);
  });

  it("SKIPS object and array values rather than stringifying them", () => {
    // The defect this exists to prevent: "[object Object]" on a public page.
    const rows = toSpecRows({ nested: { a: 1 }, list: [1, 2], ok: "yes" });
    expect(rows).toEqual([{ label: "Ok", value: "yes" }]);
  });

  it("skips null and boolean values", () => {
    expect(toSpecRows({ missing: null, flag: true, ok: "yes" })).toEqual([
      { label: "Ok", value: "yes" },
    ]);
  });

  it("skips EMPTY and whitespace-only strings — a card has only two slots", () => {
    // A CSV import (Story 4.10) is named in the source as an input, and empty cells
    // are what CSVs are made of. A blank row would consume half the card.
    expect(toSpecRows({ blank: "", spaces: "   ", ok: "yes" })).toEqual([
      { label: "Ok", value: "yes" },
    ]);
  });

  it("skips non-finite numbers rather than rendering NaN or Infinity", () => {
    expect(toSpecRows({ bad: NaN, worse: Infinity, ok: 4 })).toEqual([{ label: "Ok", value: "4" }]);
  });

  it("keeps zero, which is a legitimate spec value", () => {
    // The falsy-check trap: `if (!value) continue` would drop this.
    expect(toSpecRows({ offset: 0 })).toEqual([{ label: "Offset", value: "0" }]);
  });

  it("returns an empty array for the schema default, null, and a non-object", () => {
    expect(toSpecRows({})).toEqual([]);
    expect(toSpecRows(null)).toEqual([]);
    expect(toSpecRows(undefined)).toEqual([]);
    expect(toSpecRows("not an object")).toEqual([]);
    expect(toSpecRows(42)).toEqual([]);
  });

  it("returns an empty array for a JSON ARRAY, which is also a typeof object", () => {
    // `typeof [] === "object"` — without the Array.isArray guard this would emit
    // rows labelled "0", "1", "2".
    expect(toSpecRows([{ a: 1 }])).toEqual([]);
  });
});

describe("toProductCardItem", () => {
  const EN = { locale: "en" as const, name: "Triple-IR Flame Detector", description: null };

  function cardRow(overrides: Partial<ProductCardRow> = {}): ProductCardRow {
    return {
      id: "p1",
      slug: "fd-9500",
      model: "FD-9500",
      attributes: { detection: "Triple-IR", response: "< 5 s" },
      translations: [EN],
      manufacturer: {
        slug: "sentra-fire",
        translations: [{ locale: "en", name: "Sentra Fire Systems", description: null }],
      },
      ...overrides,
    };
  }

  it("resolves the requested locale without flagging fallback", () => {
    const item = toProductCardItem(
      cardRow({ translations: [EN, { locale: "tr", name: "Alev Dedektörü", description: null }] }),
      "tr",
    );
    expect(item.name).toBe("Alev Dedektörü");
    expect(item.isFallback).toBe(false);
  });

  it("falls back to EN and flags it; the MODEL is the last resort, never empty", () => {
    const item = toProductCardItem(cardRow({ translations: [] }), "ru");
    expect(item.name).toBe("FD-9500");
    expect(item.isFallback).toBe(false);
  });

  it("resolves the manufacturer's fallback flag INDEPENDENTLY of the product's", () => {
    // The AC6 defect class the 2.1 review caught: this flag was once discarded.
    const item = toProductCardItem(
      cardRow({ translations: [EN, { locale: "ru", name: "Извещатель", description: null }] }),
      "ru",
    );
    expect(item.isFallback).toBe(false);
    expect(item.manufacturer.isFallback).toBe(true);
    expect(item.manufacturer.name).toBe("Sentra Fire Systems");
  });

  it("derives spec rows through toSpecRows (sorted, capped at two)", () => {
    const item = toProductCardItem(cardRow(), "en");
    expect(item.specs).toEqual([
      { label: "Detection", value: "Triple-IR" },
      { label: "Response", value: "< 5 s" },
    ]);
  });
});

describe("humanizeSpecKey", () => {
  it("splits camelCase", () => {
    expect(humanizeSpecKey("hazArea")).toBe("Haz area");
    expect(humanizeSpecKey("sizeBytes")).toBe("Size bytes");
  });

  it("capitalizes a single lowercase word", () => {
    expect(humanizeSpecKey("detection")).toBe("Detection");
  });

  it("treats underscores and hyphens as word separators", () => {
    expect(humanizeSpecKey("haz_area")).toBe("Haz area");
    expect(humanizeSpecKey("haz-area")).toBe("Haz area");
  });

  it("handles digit-to-letter boundaries", () => {
    expect(humanizeSpecKey("ip66Rating")).toBe("Ip66 rating");
  });

  it("PRESERVES acronyms — this is an industrial catalogue, not prose", () => {
    // An earlier version lower-cased everything after the first character and shipped
    // `Atex`, `Iecex`, `Sil2` and `Ip66` onto public product cards. These are the
    // labels that carry the engineering meaning.
    expect(humanizeSpecKey("ATEX")).toBe("ATEX");
    expect(humanizeSpecKey("IECEx")).toBe("IECEx");
    expect(humanizeSpecKey("SIL2")).toBe("SIL2");
    expect(humanizeSpecKey("IP66Rating")).toBe("IP66 rating");
  });

  it("lower-cases a NON-acronym word the camelCase split just capitalized", () => {
    // The other half of the same rule: `Area` carries one capital, which this
    // function introduced, so it must not be mistaken for an acronym.
    expect(humanizeSpecKey("hazArea")).toBe("Haz area");
    expect(humanizeSpecKey("nominalBoreDiameter")).toBe("Nominal bore diameter");
  });

  it("returns the original key when it would humanize to nothing", () => {
    expect(humanizeSpecKey("_")).toBe("_");
    expect(humanizeSpecKey("")).toBe("");
  });
});
