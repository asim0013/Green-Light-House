import { describe, it, expect } from "vitest";
import type { z } from "zod";
import {
  industryCreateSchema,
  serviceCreateSchema,
  projectCreateSchema,
  projectRows,
  homeContentSchema,
  homeContentRows,
  teamCreateSchema,
  teamRows,
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

describe("homeContentSchema (singleton)", () => {
  it("accepts partial copy + cert marks and defaults certMarks to []", () => {
    const parsed = homeContentSchema.safeParse({ titleEn: "Hi", certMarks: ["ISO 9001"] });
    expect(parsed.success).toBe(true);
    const empty = homeContentSchema.safeParse({});
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.certMarks).toEqual([]);
  });

  it("homeContentRows writes a locale only when it has content", () => {
    const rows = homeContentRows({ titleEn: "Hi", kickerEn: "K", titleRu: "" });
    expect(rows.map((r) => r.locale)).toEqual(["en"]);
    expect(rows[0].title).toBe("Hi");
    expect(rows[0].manufacturersTitle).toBeNull();
  });
});

describe("teamCreateSchema", () => {
  it("requires an EN name and coerces order", () => {
    const ok = teamCreateSchema.safeParse({ nameEn: "Aylin", order: "3" });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.order).toBe(3);
    expect(keyAt(teamCreateSchema, { nameEn: "", order: 0 }, "nameEn")).toBe("required");
  });

  it("rejects a TR role when the TR name is empty (orphaned row)", () => {
    expect(keyAt(teamCreateSchema, { nameEn: "A", order: 0, roleTr: "Müdür" }, "roleTr")).toBe(
      "nameRequiredForLocale",
    );
  });

  it("teamRows: EN always, TR/RU only when named", () => {
    expect(teamRows({ nameEn: "A", roleEn: "Ops" })).toEqual([
      { locale: "en", name: "A", role: "Ops", bio: null },
    ]);
    expect(teamRows({ nameEn: "A", nameRu: "Я" }).map((r) => r.locale)).toEqual(["en", "ru"]);
  });
});
