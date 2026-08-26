import { describe, it, expect } from "vitest";
import { z } from "zod";
import { zodResolver } from "./zod-resolver";
import { rfqSchema, type RfqInput } from "@/server/rfq/schema";

/**
 * The hand-wired resolver, tested AGAINST THE REAL RFQ SCHEMA (Story 3.2,
 * AC12b) — not a toy schema, because the contract that matters is "the client
 * resolver and the endpoint's safeParse produce the same verdict".
 */

const VALID = {
  name: "  Elena Petrova  ",
  company: "Enka EPC",
  email: "elena@enka.example",
  locale: "ru",
  uiLocale: "en",
  consent: true,
};

// The resolver is called by react-hook-form with (values, context, options);
// it ignores the latter two, so tests may call it with values alone.
type AnyValues = Record<string, unknown>;
const call = (values: AnyValues, normalize?: (values: AnyValues) => unknown) =>
  zodResolver<AnyValues, RfqInput>(rfqSchema, normalize)(values, undefined, {
    fields: {},
    shouldUseNativeValidation: false,
  });

describe("zodResolver", () => {
  it("success returns the schema's PARSED output — trimmed, defaulted", async () => {
    const result = await call(VALID);
    expect(result.errors).toEqual({});
    const values = result.values as RfqInput;
    expect(values.name).toBe("Elena Petrova"); // trimmed by the schema
    expect(values.equipment).toEqual([]); // defaulted by the schema
  });

  it("failure maps each issue to its TOP-LEVEL field with the stable key as message", async () => {
    const result = await call({
      ...VALID,
      email: "nope",
      consent: false,
      equipment: [{ kind: "freeText", text: "" }],
    });
    expect(result.values).toEqual({});
    const errors = result.errors as Record<string, { message?: string }>;
    expect(errors.email?.message).toBe("email");
    expect(errors.consent?.message).toBe("consentRequired");
    // Nested path `equipment.0.text` lands on the PARENT field — the only one
    // registered in the DOM, so shouldFocusError has somewhere real to go.
    expect(errors.equipment?.message).toBe("required");
    expect(errors["equipment.0.text"]).toBeUndefined();
  });

  it("first issue per field wins — one message per field, never an array", async () => {
    const result = await call({ ...VALID, name: "" });
    const errors = result.errors as Record<string, { message?: string }>;
    expect(errors.name?.message).toBe("required");
  });

  it("normalize runs BEFORE parsing — the DOM's '' becomes the schema's absent", async () => {
    const domValues = { ...VALID, industry: "", timeline: "" };
    // Without normalize, "" fails the slug gate…
    const raw = await call(domValues);
    expect((raw.errors as Record<string, unknown>).industry).toBeDefined();
    // …with it, the same values parse clean.
    const normalized = await call(domValues, (values) => ({
      ...values,
      industry: (values.industry as string) || undefined,
      timeline: (values.timeline as string) || undefined,
    }));
    expect(normalized.errors).toEqual({});
    expect((normalized.values as RfqInput).industry).toBeUndefined();
  });

  it("stays reusable: works against a schema that is not the RFQ's", async () => {
    const schema = z.object({ age: z.number("required").min(18, "tooYoung") });
    const resolver = zodResolver<Record<string, unknown>, z.infer<typeof schema>>(schema);
    const bad = await resolver({ age: 12 }, undefined, {
      fields: {},
      shouldUseNativeValidation: false,
    });
    expect((bad.errors as Record<string, { message?: string }>).age?.message).toBe("tooYoung");
  });
});
