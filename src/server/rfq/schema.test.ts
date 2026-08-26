import { describe, it, expect } from "vitest";
import { rfqSchema, issueDetails, TIMELINE_KEYS, RFQ_ERROR_KEYS } from "./schema";

/**
 * The shared schema's contract (Story 3.2, AC2). What matters here is the parts
 * BOTH sides depend on: stable error KEYS (the client renders `t(`errors.${key}`)`
 * off them — an English sentence leaking into `message` breaks localization
 * silently), unknown-key stripping (the 3.7a honeypot travels in the payload and
 * must not 422), and the bounds.
 */

const VALID = {
  name: "Elena Petrova",
  company: "Enka EPC",
  email: "elena@enka.example",
  locale: "ru",
  uiLocale: "en",
  consent: true,
};

function keysFor(payload: unknown): { path: string; key: string }[] {
  const parsed = rfqSchema.safeParse(payload);
  if (parsed.success) throw new Error("expected the payload to fail validation");
  return issueDetails(parsed.error);
}

describe("rfqSchema", () => {
  it("accepts the minimal payload and defaults equipment to []", () => {
    const parsed = rfqSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.equipment).toEqual([]);
  });

  it("every issue message is a stable key from RFQ_ERROR_KEYS — never a sentence", () => {
    const details = keysFor({
      name: "  ",
      company: "x".repeat(201),
      email: "nope",
      timeline: "someday",
      industry: "Not A Slug",
      locale: "de",
      uiLocale: "en",
      consent: false,
      equipment: [{ kind: "freeText", text: "" }],
    });
    expect(details.length).toBeGreaterThanOrEqual(7);
    for (const detail of details) {
      expect(RFQ_ERROR_KEYS).toContain(detail.key);
    }
    expect(details).toContainEqual({ path: "name", key: "required" });
    expect(details).toContainEqual({ path: "company", key: "tooLong" });
    expect(details).toContainEqual({ path: "email", key: "email" });
    expect(details).toContainEqual({ path: "consent", key: "consentRequired" });
    expect(details).toContainEqual({ path: "equipment.0.text", key: "required" });
  });

  it("missing required fields report keys too (a direct POST of {})", () => {
    const details = keysFor({});
    for (const path of ["name", "company", "email", "locale", "uiLocale", "consent"]) {
      expect(details.map((d) => d.path)).toContain(path);
    }
    for (const detail of details) {
      expect(RFQ_ERROR_KEYS).toContain(detail.key);
    }
  });

  it("strips unknown keys instead of rejecting them — the honeypot travels here", () => {
    const parsed = rfqSchema.safeParse({
      ...VALID,
      website: "https://filled-by-a-bot.example",
      source: "project",
      consentVersion: "forged",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).not.toHaveProperty("website");
      expect(parsed.data).not.toHaveProperty("source");
      expect(parsed.data).not.toHaveProperty("consentVersion");
    }
  });

  it("equipment: slug-gated catalog kinds, bounded count, tagged union only", () => {
    expect(
      rfqSchema.safeParse({
        ...VALID,
        equipment: [{ kind: "product", slug: "../../etc", label: "x" }],
      }).success,
    ).toBe(false);
    expect(
      rfqSchema.safeParse({
        ...VALID,
        equipment: [{ slug: "detector-x", label: "no kind" }],
      }).success,
    ).toBe(false);
    expect(
      rfqSchema.safeParse({
        ...VALID,
        equipment: Array.from({ length: 21 }, (_, i) => ({
          kind: "freeText",
          text: `item ${i}`,
        })),
      }).success,
    ).toBe(false);
  });

  it("timeline accepts only the frozen key set", () => {
    for (const key of TIMELINE_KEYS) {
      expect(rfqSchema.safeParse({ ...VALID, timeline: key }).success).toBe(true);
    }
    expect(rfqSchema.safeParse({ ...VALID, timeline: "next-week" }).success).toBe(false);
  });

  it("consent must be literally true — truthy strings do not pass", () => {
    expect(rfqSchema.safeParse({ ...VALID, consent: "true" }).success).toBe(false);
    expect(rfqSchema.safeParse({ ...VALID, consent: 1 }).success).toBe(false);
  });

  it("email is trimmed before the format check — the phone-keyboard trailing space", () => {
    const parsed = rfqSchema.safeParse({ ...VALID, email: "  elena@enka.example  " });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("elena@enka.example");
  });

  it("hostile code points are rejected with the `invalid` key on every text field", () => {
    // NUL and lone surrogates break the Prisma insert itself; bidi overrides
    // spoof what the 4.7 admin reads. Rejected at the boundary, never stripped.
    const hostile = [
      { name: "Elena\u0000Petrova" },
      { company: "Enka\u202Egpj.exe" },
      { projectDetails: "x\uD800y" },
      { quantities: "12\u0001units" },
      { equipment: [{ kind: "freeText", text: "crane\u2066" }] },
    ];
    for (const overlay of hostile) {
      const details = keysFor({ ...VALID, ...overlay });
      expect(details.length, JSON.stringify(overlay)).toBeGreaterThan(0);
      for (const detail of details) expect(detail.key).toBe("invalid");
    }
    // Legitimate whitespace survives: a multi-line projectDetails is a textarea.
    expect(
      rfqSchema.safeParse({ ...VALID, projectDetails: "line one\nline two\ttabbed" }).success,
    ).toBe(true);
  });
});
