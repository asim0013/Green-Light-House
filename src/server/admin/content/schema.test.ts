import { describe, it, expect } from "vitest";
import type { z } from "zod";
import {
  industryCreateSchema,
  serviceCreateSchema,
  projectCreateSchema,
  projectRows,
} from "./schema";
import { issueDetails } from "@/server/rfq/schema";

const keyAt = (schema: z.ZodTypeAny, raw: unknown, path: string) => {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return null;
  return issueDetails(parsed.error).find((d) => d.path === path)?.key ?? null;
};

describe("industryCreateSchema (name + description, reused from 4.3)", () => {
  it("accepts EN-only, requires EN name, rejects a bad slug and orphaned TR description", () => {
    expect(industryCreateSchema.safeParse({ slug: "oil-gas", nameEn: "Oil & Gas" }).success).toBe(
      true,
    );
    expect(keyAt(industryCreateSchema, { slug: "oil-gas", nameEn: "" }, "nameEn")).toBe("required");
    expect(keyAt(industryCreateSchema, { slug: "Oil Gas", nameEn: "x" }, "slug")).toBe(
      "slugInvalid",
    );
    expect(
      keyAt(
        industryCreateSchema,
        { slug: "oil-gas", nameEn: "x", descriptionTr: "y" },
        "descriptionTr",
      ),
    ).toBe("descriptionWithoutName");
  });
});

describe("serviceCreateSchema", () => {
  it("accepts a minimal EN-only service", () => {
    expect(
      serviceCreateSchema.safeParse({ slug: "commissioning", nameEn: "Commissioning" }).success,
    ).toBe(true);
  });
});

describe("projectCreateSchema", () => {
  const base = { slug: "marmara-lng", status: "draft" as const, titleEn: "Marmara LNG" };

  it("accepts a valid draft with only EN title", () => {
    expect(projectCreateSchema.safeParse(base).success).toBe(true);
  });

  it("requires an EN title", () => {
    expect(keyAt(projectCreateSchema, { ...base, titleEn: "" }, "titleEn")).toBe("required");
  });

  it("rejects a TR field when the TR title is empty (orphaned locale row)", () => {
    // P5: drop the projectLocaleGuard and this stops reddening.
    expect(keyAt(projectCreateSchema, { ...base, descriptionTr: "Türkçe" }, "descriptionTr")).toBe(
      "titleRequiredForLocale",
    );
  });

  it("coerces leadTimeWeeks and validates the delivered date shape", () => {
    const ok = projectCreateSchema.safeParse({
      ...base,
      leadTimeWeeks: "6",
      deliveredAt: "2026-03-01",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.leadTimeWeeks).toBe(6);
    expect(keyAt(projectCreateSchema, { ...base, deliveredAt: "01/03/2026" }, "deliveredAt")).toBe(
      "invalid",
    );
  });

  it("treats empty scalars as absent", () => {
    const parsed = projectCreateSchema.safeParse({
      ...base,
      industryId: "",
      deliveredAt: "",
      leadTimeWeeks: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.industryId).toBeUndefined();
      expect(parsed.data.deliveredAt).toBeUndefined();
      expect(parsed.data.leadTimeWeeks).toBeUndefined();
    }
  });
});

describe("projectRows", () => {
  it("emits EN always, TR/RU only when their title is set, nulls for absent fields", () => {
    expect(projectRows({ titleEn: "A", descriptionEn: "d" })).toEqual([
      { locale: "en", title: "A", description: "d", outcome: null, scope: null, location: null },
    ]);
    const rows = projectRows({ titleEn: "A", titleRu: "Я", locationRu: "Москва" });
    expect(rows.map((r) => r.locale)).toEqual(["en", "ru"]);
    expect(rows[1]).toEqual({
      locale: "ru",
      title: "Я",
      description: null,
      outcome: null,
      scope: null,
      location: "Москва",
    });
  });
});
