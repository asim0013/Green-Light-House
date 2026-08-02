import { describe, it, expect } from "vitest";
import { shouldShowFallbackNotice } from "./fallback";

describe("shouldShowFallbackNotice", () => {
  it("shows the notice when the content fell back to EN", () => {
    expect(shouldShowFallbackNotice(true)).toBe(true);
  });

  it("hides the notice when the content is in the requested locale", () => {
    expect(shouldShowFallbackNotice(false)).toBe(false);
  });
});
