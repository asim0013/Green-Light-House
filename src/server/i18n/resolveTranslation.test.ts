import { describe, it, expect } from "vitest";
import { resolveTranslation, DEFAULT_LOCALE } from "./resolveTranslation";

type Row = { locale: "en" | "tr" | "ru"; name: string };

const rows: Row[] = [
  { locale: "en", name: "Flame detector" },
  { locale: "tr", name: "Alev dedektörü" },
];

describe("resolveTranslation", () => {
  it("returns the exact locale when present", () => {
    const r = resolveTranslation(rows, "tr");
    expect(r?.value.name).toBe("Alev dedektörü");
    expect(r?.isFallback).toBe(false);
    expect(r?.resolvedLocale).toBe("tr");
  });

  it("falls back to EN (flagged) when the locale is missing", () => {
    const r = resolveTranslation(rows, "ru");
    expect(r?.value.name).toBe("Flame detector");
    expect(r?.isFallback).toBe(true);
    expect(r?.resolvedLocale).toBe(DEFAULT_LOCALE);
  });

  it("returns null when neither the locale nor EN exists", () => {
    const r = resolveTranslation([{ locale: "tr", name: "x" }] as Row[], "ru");
    expect(r).toBeNull();
  });
});
