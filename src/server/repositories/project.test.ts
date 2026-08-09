import { describe, it, expect } from "vitest";
import { toProjectListItem, type ProjectRow } from "./project";

/**
 * Pure mapping logic for the project repository (Story 1.7).
 *
 * The DB round-trip (published-only filter, NULLS LAST ordering) is covered by
 * `repository.integration.test.ts`; this covers the resolution/shape half — which
 * is where the seeded data is thinnest. Every field the homepage hero reads is
 * optional in the schema: `outcome`, `description`, `deliveredAt` are nullable
 * columns, `industryId` is a nullable FK (`onDelete: SetNull`), and a row can
 * carry no translation at all. The hero must survive all of them.
 */

const EN = {
  locale: "en" as const,
  title: "LNG terminal upgrade",
  description: null,
  outcome: null,
};

function row(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: "p1",
    slug: "lng-terminal-upgrade",
    deliveredAt: null,
    media: [],
    translations: [EN],
    industry: null,
    ...overrides,
  };
}

describe("toProjectListItem", () => {
  it("uses the requested locale when present and does not flag a fallback", () => {
    const item = toProjectListItem(
      row({
        translations: [
          EN,
          { locale: "tr", title: "LNG terminali yükseltmesi", description: null, outcome: null },
        ],
      }),
      "tr",
    );
    expect(item.title).toBe("LNG terminali yükseltmesi");
    expect(item.isFallback).toBe(false);
  });

  it("falls back to EN and flags it when the requested locale is missing", () => {
    const item = toProjectListItem(row(), "ru");
    expect(item.title).toBe("LNG terminal upgrade");
    expect(item.isFallback).toBe(true);
  });

  it("falls back to the slug when the row has no translation at all", () => {
    const item = toProjectListItem(row({ translations: [] }), "en");
    expect(item.title).toBe("lng-terminal-upgrade");
    expect(item.isFallback).toBe(false);
  });

  it("carries outcome and description through when present", () => {
    const item = toProjectListItem(
      row({
        translations: [
          {
            locale: "en",
            title: "T",
            description: "D",
            outcome: "142 field devices, ATEX Zone 1.",
          },
        ],
      }),
      "en",
    );
    expect(item.outcome).toBe("142 field devices, ATEX Zone 1.");
    expect(item.description).toBe("D");
  });

  it("returns null for a missing outcome rather than an empty string", () => {
    // The seeded `refinery-gas-detection-retrofit` has no outcome — the hero card
    // must be able to tell "absent" from "blank" so it can omit the row entirely.
    const item = toProjectListItem(row(), "en");
    expect(item.outcome).toBeNull();
    expect(item.description).toBeNull();
  });

  it("tolerates a null industry (nullable FK, onDelete: SetNull)", () => {
    expect(toProjectListItem(row(), "en").industry).toBeNull();
  });

  it("resolves the industry name in the requested locale", () => {
    const item = toProjectListItem(
      row({
        industry: {
          slug: "oil-gas",
          translations: [
            { locale: "en", name: "Oil & Gas" },
            { locale: "ru", name: "Нефть и газ" },
          ],
        },
      }),
      "ru",
    );
    expect(item.industry).toEqual({ slug: "oil-gas", name: "Нефть и газ" });
  });

  it("falls back the industry name independently of the project title", () => {
    // A project can be translated while its industry is not, and vice versa.
    const item = toProjectListItem(
      row({
        translations: [EN, { locale: "tr", title: "TR başlık", description: null, outcome: null }],
        industry: { slug: "energy", translations: [{ locale: "en", name: "Energy" }] },
      }),
      "tr",
    );
    expect(item.title).toBe("TR başlık");
    expect(item.isFallback).toBe(false);
    expect(item.industry?.name).toBe("Energy");
  });

  it("falls back the industry name to its slug when it has no translations", () => {
    const item = toProjectListItem(row({ industry: { slug: "nuclear", translations: [] } }), "en");
    expect(item.industry).toEqual({ slug: "nuclear", name: "nuclear" });
  });

  it("preserves a null deliveredAt", () => {
    expect(toProjectListItem(row(), "en").deliveredAt).toBeNull();
  });

  it("preserves a present deliveredAt", () => {
    const when = new Date("2024-06-01T00:00:00.000Z");
    expect(toProjectListItem(row({ deliveredAt: when }), "en").deliveredAt).toEqual(when);
  });
});
