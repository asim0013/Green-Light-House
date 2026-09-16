import { describe, it, expect } from "vitest";
import {
  CATALOG_ERROR_KEYS,
  manufacturerCreateSchema,
  categoryCreateSchema,
  productCreateSchema,
  nameRows,
  nameDescriptionRows,
  attributesObject,
} from "./schema";
import { issueDetails } from "@/server/rfq/schema";

/** Stable error keys → drift catcher (the client's inline-English map keys off these). */
describe("CATALOG_ERROR_KEYS", () => {
  it("is the pinned set", () => {
    expect([...CATALOG_ERROR_KEYS]).toEqual([
      "required",
      "tooLong",
      "invalid",
      "slugInvalid",
      "enRequired",
      "descriptionWithoutName",
      "duplicateAttributeKey",
    ]);
  });
});

const firstKeyFor = (
  schema: { safeParse: (v: unknown) => ReturnType<typeof manufacturerCreateSchema.safeParse> },
  raw: unknown,
  path: string,
) => {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return null;
  return issueDetails(parsed.error).find((d) => d.path === path)?.key ?? null;
};

describe("manufacturerCreateSchema", () => {
  const valid = { slug: "bosch", nameEn: "Bosch" };

  it("accepts a minimal EN-only manufacturer", () => {
    expect(manufacturerCreateSchema.safeParse(valid).success).toBe(true);
  });

  it("requires an EN name", () => {
    // P5: make nameEn optional and this stops reddening.
    expect(firstKeyFor(manufacturerCreateSchema, { slug: "bosch", nameEn: "" }, "nameEn")).toBe(
      "required",
    );
  });

  it("rejects a malformed slug", () => {
    expect(
      firstKeyFor(manufacturerCreateSchema, { slug: "Bosch GmbH", nameEn: "Bosch" }, "slug"),
    ).toBe("slugInvalid");
  });

  it("rejects a TR description with no TR name (row would be orphaned)", () => {
    const raw = { ...valid, descriptionTr: "Türkçe açıklama" };
    expect(firstKeyFor(manufacturerCreateSchema, raw, "descriptionTr")).toBe(
      "descriptionWithoutName",
    );
  });
});

describe("categoryCreateSchema (name-only + optional parent)", () => {
  it("accepts an optional parentId and treats empty string as absent", () => {
    const parsed = categoryCreateSchema.safeParse({
      slug: "detection",
      nameEn: "Detection",
      parentId: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.parentId).toBeUndefined();
  });
});

describe("productCreateSchema", () => {
  const base = {
    slug: "fx-100",
    model: "FX-100",
    manufacturerId: "m1",
    categoryId: "c1",
    status: "draft" as const,
    nameEn: "FX-100 Detector",
  };

  it("accepts a valid draft product", () => {
    expect(productCreateSchema.safeParse(base).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(productCreateSchema.safeParse({ ...base, status: "archived" }).success).toBe(false);
  });

  it("rejects duplicate attribute keys", () => {
    const raw = {
      ...base,
      attributes: [
        { key: "voltage", value: "24V" },
        { key: "voltage", value: "12V" },
      ],
    };
    const parsed = productCreateSchema.safeParse(raw);
    expect(parsed.success).toBe(false);
  });
});

describe("translation-row assembly", () => {
  it("nameRows: EN always, TR/RU only when named", () => {
    expect(nameRows({ nameEn: "A" })).toEqual([{ locale: "en", name: "A" }]);
    expect(nameRows({ nameEn: "A", nameRu: "Я" })).toEqual([
      { locale: "en", name: "A" },
      { locale: "ru", name: "Я" },
    ]);
  });

  it("nameDescriptionRows: description null when absent, row only when named", () => {
    expect(nameDescriptionRows({ nameEn: "A", descriptionTr: "x" })).toEqual([
      { locale: "en", name: "A", description: null },
    ]);
    expect(nameDescriptionRows({ nameEn: "A", nameTr: "B", descriptionTr: "x" })).toEqual([
      { locale: "en", name: "A", description: null },
      { locale: "tr", name: "B", description: "x" },
    ]);
  });

  it("attributesObject folds pairs into an object", () => {
    expect(attributesObject([{ key: "v", value: "24V" }])).toEqual({ v: "24V" });
    expect(attributesObject(undefined)).toEqual({});
  });
});
