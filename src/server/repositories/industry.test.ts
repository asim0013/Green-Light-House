import { describe, it, expect } from "vitest";
import { toIndustryListItem, type IndustryRow } from "./industry";

/**
 * Pure mapping logic for the industry repository (Story 2.1).
 *
 * The DB round-trip (the `findUnique` by slug, the null-on-absent contract) is
 * covered by `repository.integration.test.ts`; this covers the resolution half.
 * Every human-readable field is optional in the schema — `description` is nullable
 * and a row can carry no translation at all — and the industry landing page's H1
 * is built from `name`, so a mapper that returns an empty string here ships a page
 * with a blank heading.
 */

const EN = { locale: "en" as const, name: "Oil & Gas", description: "Upstream and downstream." };

function row(overrides: Partial<IndustryRow> = {}): IndustryRow {
  return { id: "i1", slug: "oil-gas", translations: [EN], ...overrides };
}

describe("toIndustryListItem", () => {
  it("uses the requested locale when present and does not flag a fallback", () => {
    const item = toIndustryListItem(
      row({ translations: [EN, { locale: "ru", name: "Нефть и газ", description: null }] }),
      "ru",
    );
    expect(item.name).toBe("Нефть и газ");
    expect(item.isFallback).toBe(false);
  });

  it("falls back to EN and flags it when the requested locale is missing", () => {
    const item = toIndustryListItem(row(), "ru");
    expect(item.name).toBe("Oil & Gas");
    expect(item.isFallback).toBe(true);
  });

  it("falls back to the slug when the row has no translation at all", () => {
    // Not the empty string: this value becomes the page's <h1> and the breadcrumb's
    // current-page label, so it must always be something renderable.
    const item = toIndustryListItem(row({ translations: [] }), "en");
    expect(item.name).toBe("oil-gas");
    expect(item.isFallback).toBe(false);
  });

  it("returns null for a missing description rather than an empty string", () => {
    const item = toIndustryListItem(
      row({ translations: [{ locale: "en", name: "Nuclear", description: null }] }),
      "en",
    );
    expect(item.description).toBeNull();
  });

  it("carries the description through when present", () => {
    expect(toIndustryListItem(row(), "en").description).toBe("Upstream and downstream.");
  });

  it("preserves id and slug unchanged", () => {
    const item = toIndustryListItem(row(), "en");
    expect(item.id).toBe("i1");
    expect(item.slug).toBe("oil-gas");
  });
});
