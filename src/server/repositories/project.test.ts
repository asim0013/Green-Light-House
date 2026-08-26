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

/**
 * Story 3.1, AC2b — PER-FIELD fallback for the body text.
 *
 * ⚠️ THE HOLE THIS CLOSES WAS MEASURED LIVE, on the exact rows this story renders.
 * `resolveTranslation` picks a ROW, not a FIELD. The seeded LNG project has a `tr`
 * row whose `outcome` is NULL while the `en` row has one, so `/tr` silently
 * dropped the outcome AND reported `isFallback: false` — no `lang`, no visible
 * notice, nothing to tell reader or crawler anything was missing. It also made the
 * page score `itemCount: 0` and go `noindex` for a reason nobody could see.
 *
 * The fix is the shape `ProductCardItem` already uses for manufacturer names:
 * per-field flags, so the renderer marks ONLY the string that actually fell back.
 */
describe("toProjectListItem — per-field fallback (Story 3.1)", () => {
  const EN_FULL = {
    locale: "en" as const,
    title: "LNG terminal fire & gas upgrade",
    description: "A full fire-and-gas package.",
    outcome: "142 field devices, ATEX Zone 1.",
  };
  // The real seeded shape: a translated title, but the body fields left NULL.
  const TR_TITLE_ONLY = {
    locale: "tr" as const,
    title: "LNG terminali yangın ve gaz yükseltmesi",
    description: null,
    outcome: null,
  };

  it("falls back a NULL field to EN even when the requested locale HAS a row", () => {
    const item = toProjectListItem(row({ translations: [EN_FULL, TR_TITLE_ONLY] }), "tr");

    expect(item.title).toBe("LNG terminali yangın ve gaz yükseltmesi");
    expect(item.isFallback).toBe(false); // the TITLE did not fall back
    expect(item.outcome).toBe("142 field devices, ATEX Zone 1."); // ...but the outcome did
    expect(item.outcomeIsFallback).toBe(true);
    expect(item.description).toBe("A full fire-and-gas package.");
    expect(item.descriptionIsFallback).toBe(true);
  });

  it("does not flag a field that is present in the requested locale", () => {
    const item = toProjectListItem(
      row({
        translations: [
          EN_FULL,
          { locale: "tr", title: "T", description: "TR açıklama", outcome: "TR sonuç" },
        ],
      }),
      "tr",
    );
    expect(item.outcomeIsFallback).toBe(false);
    expect(item.descriptionIsFallback).toBe(false);
  });

  it("never flags EN itself as a fallback — it is the source language", () => {
    const item = toProjectListItem(row({ translations: [EN_FULL] }), "en");
    expect(item.outcomeIsFallback).toBe(false);
    expect(item.descriptionIsFallback).toBe(false);
  });

  it("reports null, not a flag, when NO locale has the field", () => {
    // The seeded `refinery-gas-detection-retrofit`: EN-only and outcome-less.
    const item = toProjectListItem(
      row({ translations: [{ locale: "en", title: "T", description: null, outcome: null }] }),
      "tr",
    );
    expect(item.outcome).toBeNull();
    expect(item.outcomeIsFallback).toBe(false);
  });
});

/**
 * Story 3.1, AC9 — `media` is parsed HERE, at the repository boundary, and once.
 *
 * The mapper runs inside the cached callback, so what these tests pin is also
 * what Redis stores: the frozen, sorted, de-duplicated shape rather than raw
 * JSONB. Before this story `media` was passed through as `unknown` with the
 * comment "shape is content-defined", and `src/lib/project-media.ts` — frozen by
 * Story 3.0 for exactly this consumer — had zero production importers.
 */
describe("toProjectListItem — media parsing (Story 3.1)", () => {
  const entry = (over: Record<string, unknown> = {}) => ({
    id: "hero",
    storageKey: "projects/lng/hero.jpg",
    mime: "image/jpeg",
    alt: { en: "Gas detection skid on the jetty" },
    sort: 0,
    ...over,
  });

  it("parses raw JSONB into the frozen shape", () => {
    const item = toProjectListItem(row({ media: [entry()] }), "en");
    expect(item.media).toHaveLength(1);
    expect(item.media[0]).toMatchObject({ id: "hero", mime: "image/jpeg" });
  });

  it("returns [] for the seeded empty column and for anything unparseable", () => {
    expect(toProjectListItem(row({ media: [] }), "en").media).toEqual([]);
    expect(toProjectListItem(row({ media: null }), "en").media).toEqual([]);
    expect(toProjectListItem(row({ media: "not an array" }), "en").media).toEqual([]);
    expect(toProjectListItem(row({ media: { id: "hero" } }), "en").media).toEqual([]);
  });

  it("DROPS an SVG entry — the security boundary must hold at the repository, not at render", () => {
    // If this ever goes green with an svg present, the project has stored XSS the
    // moment Epic 4 accepts uploads. `project-media.ts` explains why.
    const item = toProjectListItem(row({ media: [entry({ mime: "image/svg+xml" })] }), "en");
    expect(item.media).toEqual([]);
  });

  it("sorts by `sort` and drops duplicate ids before anything downstream sees them", () => {
    const item = toProjectListItem(
      row({
        media: [
          entry({ id: "c", sort: 2 }),
          entry({ id: "a", sort: 0 }),
          entry({ id: "a", sort: 1, storageKey: "dupe.jpg" }),
        ],
      }),
      "en",
    );
    expect(item.media.map((m) => m.id)).toEqual(["a", "c"]);
    expect(item.media[0]?.storageKey).toBe("projects/lng/hero.jpg");
  });

  it("never throws on hostile JSONB — a malformed blob degrades to 'no photos'", () => {
    expect(() =>
      toProjectListItem(row({ media: [null, 42, entry({ alt: null }), entry()] }), "en"),
    ).not.toThrow();
    expect(toProjectListItem(row({ media: [null, 42, entry({ alt: null })] }), "en").media).toEqual(
      [],
    );
  });
});
