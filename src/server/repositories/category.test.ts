import { describe, it, expect } from "vitest";
import {
  toCategoryListItem,
  assembleCategoryTree,
  type CategoryRow,
  type FlatCategoryRow,
} from "./category";

/**
 * Pure mapping + tree assembly for the category repository (Story 2.2).
 *
 * The DB round-trips (filtered `_count`, parent/children includes, the caps) are
 * covered by `repository.integration.test.ts`; this covers the halves that must
 * hold for ANY data shape — especially the assembler, which the /products page
 * navigation is built from.
 */

const EN = { locale: "en" as const, name: "Fire & gas detection" };

function row(overrides: Partial<CategoryRow> = {}): CategoryRow {
  return { id: "c1", slug: "fire-gas-detection", translations: [EN], ...overrides };
}

function flat(id: string, parentId: string | null, publishedCount = 0, slug = id): FlatCategoryRow {
  return {
    id,
    slug,
    parentId,
    publishedCount,
    translations: [{ locale: "en", name: id.toUpperCase() }],
  };
}

describe("toCategoryListItem", () => {
  it("uses the requested locale when present", () => {
    const item = toCategoryListItem(
      row({ translations: [EN, { locale: "tr", name: "Yangın ve gaz algılama" }] }),
      "tr",
    );
    expect(item.name).toBe("Yangın ve gaz algılama");
    expect(item.isFallback).toBe(false);
  });

  it("falls back to EN and flags it", () => {
    const item = toCategoryListItem(row(), "ru");
    expect(item.name).toBe("Fire & gas detection");
    expect(item.isFallback).toBe(true);
  });

  it("falls back to the slug when there is no translation at all", () => {
    expect(toCategoryListItem(row({ translations: [] }), "en").name).toBe("fire-gas-detection");
  });
});

describe("assembleCategoryTree", () => {
  it("assembles the measured seed shape: 4 roots, one child", () => {
    const roots = assembleCategoryTree(
      [
        flat("ex-proof", null, 1),
        flat("fire-gas-detection", null, 1),
        flat("fixed-suppression", null, 0),
        flat("ppe", null, 1),
        flat("flame-detectors", "fire-gas-detection", 2),
      ],
      "en",
    );
    expect(roots.map((r) => r.slug)).toEqual([
      "ex-proof",
      "fire-gas-detection",
      "fixed-suppression",
      "ppe",
    ]);
    const parent = roots.find((r) => r.slug === "fire-gas-detection")!;
    expect(parent.children.map((c) => c.slug)).toEqual(["flame-detectors"]);
    // Direct counts, NO roll-up (Task 0): the parent's own count stays 1 even
    // though its child holds 2 — roll-up would make the toolbar count lie.
    expect(parent.publishedCount).toBe(1);
    expect(parent.children[0].publishedCount).toBe(2);
  });

  it("is depth-agnostic: a grandchild nests under its child", () => {
    const roots = assembleCategoryTree([flat("a", null), flat("b", "a"), flat("c", "b")], "en");
    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].children[0].slug).toBe("c");
  });

  it("PROMOTES an orphan to a root rather than silently dropping it", () => {
    // A row whose parent was cut by the cap (or corrupted) must stay reachable —
    // an invisible category is worse than a mis-nested one.
    const roots = assembleCategoryTree([flat("orphan", "no-such-parent", 3)], "en");
    expect(roots.map((r) => r.slug)).toEqual(["orphan"]);
    expect(roots[0].publishedCount).toBe(3);
  });

  it("returns an empty forest for no rows", () => {
    expect(assembleCategoryTree([], "en")).toEqual([]);
  });

  it("resolves node names for the requested locale", () => {
    const roots = assembleCategoryTree(
      [
        {
          ...flat("ppe", null, 1),
          translations: [
            { locale: "en", name: "PPE" },
            { locale: "ru", name: "СИЗ" },
          ],
        },
      ],
      "ru",
    );
    expect(roots[0].name).toBe("СИЗ");
    expect(roots[0].isFallback).toBe(false);
  });
});
