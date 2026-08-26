import { describe, it, expect } from "vitest";
import { buildRfqFormData } from "./submit-rfq";

/**
 * The multipart body the browser sends (Story 3.7b, AC1).
 *
 * HONEST SCOPE: this covers the part that can be tested without a network. The
 * XHR wiring itself — the progress events, the deliberately-unset content-type,
 * the error/abort rejections — is proven by `e2e/rfq.spec.ts`, which uploads a
 * real file through a real browser to the real endpoint. Asserting XHR
 * behaviour against a hand-rolled fake here would prove that the fake behaves
 * like the fake.
 */

describe("buildRfqFormData", () => {
  const payload = { name: "Elena Petrova", consent: true, website: "" };

  it("carries the payload as ONE JSON part, not as loose fields", () => {
    // Task 0 #2: one encoding for both transports. Field-by-field multipart
    // would need a second decoder on the server and would immediately drift
    // from the shared zod schema — arrays and the tagged equipment union have
    // no natural form-field spelling.
    const form = buildRfqFormData(payload, new File(["x"], "spec.pdf"));
    const part = form.get("payload");
    expect(typeof part).toBe("string");
    expect(JSON.parse(part as string)).toEqual(payload);
  });

  it("keeps the honeypot field INSIDE the payload where the server reads it", () => {
    // The server reads `website` off the raw parse of the payload part. If it
    // were promoted to a sibling form field, the trap would silently stop
    // firing and every bot submission would become a real lead.
    const form = buildRfqFormData(
      { ...payload, website: "https://spam.example" },
      new File([], "a.pdf"),
    );
    const parsed = JSON.parse(form.get("payload") as string);
    expect(parsed.website).toBe("https://spam.example");
    expect(form.get("website")).toBeNull();
  });

  it("sends the file under `attachment`, with its original name", () => {
    const form = buildRfqFormData(payload, new File(["bytes"], "bill of quantities.xlsx"));
    const file = form.get("attachment") as File;
    expect(file).toBeInstanceOf(File);
    // Spaces and all — the server stores the name and derives the key
    // separately, so nothing here needs sanitizing (and sanitizing silently
    // would violate the schema's reject-never-alter doctrine).
    expect(file.name).toBe("bill of quantities.xlsx");
  });

  it("sends exactly two parts — nothing else rides along", () => {
    const form = buildRfqFormData(payload, new File(["x"], "spec.pdf"));
    expect([...form.keys()].sort()).toEqual(["attachment", "payload"]);
  });
});
