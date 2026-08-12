import { describe, it, expect } from "vitest";
import { toServiceListItem, type ServiceRow } from "./service";

/** Pure mapping logic for the service repository (Story 2.1). */

const EN = {
  locale: "en" as const,
  name: "Technical selection",
  description: "We spec the equipment against your standards.",
};

function row(overrides: Partial<ServiceRow> = {}): ServiceRow {
  return { id: "s1", slug: "technical-selection", translations: [EN], ...overrides };
}

describe("toServiceListItem", () => {
  it("uses the requested locale when present", () => {
    const item = toServiceListItem(
      row({ translations: [EN, { locale: "tr", name: "Teknik seçim", description: null }] }),
      "tr",
    );
    expect(item.name).toBe("Teknik seçim");
    expect(item.isFallback).toBe(false);
  });

  it("falls back to EN and flags it", () => {
    const item = toServiceListItem(row(), "ru");
    expect(item.name).toBe("Technical selection");
    expect(item.isFallback).toBe(true);
  });

  it("falls back to the slug when there is no translation at all", () => {
    expect(toServiceListItem(row({ translations: [] }), "en").name).toBe("technical-selection");
  });

  it("returns null for a missing description rather than an empty string", () => {
    const item = toServiceListItem(
      row({ translations: [{ locale: "en", name: "Kitting", description: null }] }),
      "en",
    );
    expect(item.description).toBeNull();
  });
});
