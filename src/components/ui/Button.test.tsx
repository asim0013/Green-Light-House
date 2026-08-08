import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buttonClasses } from "./buttonClasses";
import { Button } from "./Button";

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
    expect(buttonClasses("primary", "mt-4")).toContain("mt-4");
    expect(buttonClasses()).toBe(buttonClasses("primary"));
  });
});

describe("Button", () => {
  it("defaults to type=button (never auto-submits a form)", () => {
    const html = renderToStaticMarkup(<Button>Go</Button>);
    expect(html).toContain('type="button"');
  });

  it("link variant renders a trailing arrow icon", () => {
    const html = renderToStaticMarkup(<Button variant="link">More</Button>);
    expect(html).toContain("<svg");
  });

  it("non-link variants render no icon", () => {
    const html = renderToStaticMarkup(<Button variant="primary">Save</Button>);
    expect(html).not.toContain("<svg");
  });
});
