import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import en from "../../messages/en.json";
import { COOKIES_EFFECTIVE, COOKIES_COPY_FINGERPRINT, LEGAL_EFFECTIVE } from "./legal";

/**
 * The Cookie Policy's effective-date bump rule (Story 5.8 review F7). The copy
 * changed substantively in 5.2 and 5.8 while a shared month label stayed put; this
 * makes the rule falsifiable instead of a memory.
 */
describe("Cookie Policy effective date", () => {
  it("is pinned to the current EN copy — editing the copy without re-recording fails", () => {
    const actual = createHash("sha256").update(JSON.stringify(en.Legal.cookies)).digest("hex");
    expect(
      actual,
      "Legal.cookies (EN) changed. If the change is substantive, advance COOKIES_EFFECTIVE; " +
        "either way re-record COOKIES_COPY_FINGERPRINT in src/config/legal.ts.",
    ).toBe(COOKIES_COPY_FINGERPRINT);
  });

  it("is a real calendar day, and not older than the shared Terms period", () => {
    expect(COOKIES_EFFECTIVE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(COOKIES_EFFECTIVE))).toBe(false);
    expect(COOKIES_EFFECTIVE.startsWith(LEGAL_EFFECTIVE) || COOKIES_EFFECTIVE > LEGAL_EFFECTIVE).toBe(true);
  });
});
