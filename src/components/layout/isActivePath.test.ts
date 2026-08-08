import { describe, it, expect } from "vitest";
import { isActivePath } from "./isActivePath";

describe("isActivePath", () => {
  it("home is active only on an exact /", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/industries", "/")).toBe(false);
  });

  it("a section is active on its own path", () => {
    expect(isActivePath("/industries", "/industries")).toBe(true);
  });

  it("a section stays active on a nested sub-path", () => {
    expect(isActivePath("/industries/oil-gas", "/industries")).toBe(true);
  });

  it("does not match a different section", () => {
    expect(isActivePath("/products", "/industries")).toBe(false);
  });

  it("does not match a prefix-only string (needs a path boundary)", () => {
    expect(isActivePath("/industries-foo", "/industries")).toBe(false);
  });
});
