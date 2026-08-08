import { describe, it, expect } from "vitest";
import { buttonClasses } from "./buttonClasses";

describe("buttonClasses", () => {
  it("primary → accent navy fill, white label", () => {
    const c = buttonClasses("primary");
    expect(c).toContain("bg-accent");
    expect(c).toContain("text-white");
  });

  it("secondary → ink hairline + ink label, no accent fill", () => {
    const c = buttonClasses("secondary");
    expect(c).toContain("border-ink");
    expect(c).toContain("text-ink");
    expect(c).not.toContain("bg-accent");
  });

  it("onDarkPrimary → white fill, ink label (inverted for dark bands)", () => {
    const c = buttonClasses("onDarkPrimary");
    expect(c).toContain("bg-surface");
    expect(c).toContain("text-ink");
  });

  it("onDarkSecondary → white hairline + white label", () => {
    const c = buttonClasses("onDarkSecondary");
    expect(c).toContain("border-white");
    expect(c).toContain("text-white");
  });

  it("link → accent text, no fill", () => {
    const c = buttonClasses("link");
    expect(c).toContain("text-accent");
    expect(c).not.toContain("bg-accent");
  });

  it("no variant uses green (brand is sacred to the mark)", () => {
    for (const v of ["primary", "secondary", "onDarkPrimary", "onDarkSecondary", "link"] as const) {
      expect(buttonClasses(v)).not.toContain("brand");
    }
  });

  it("defaults to primary and appends a custom className", () => {
    expect(buttonClasses()).toBe(buttonClasses("primary"));
    expect(buttonClasses("primary", "mt-4")).toContain("mt-4");
  });
});
