import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TwoColumn } from "./TwoColumn";

/**
 * TwoColumn responsive behaviour (Story 1.7).
 *
 * The Story-1.5 review deferred this: a `flex-1` main beside a FIXED-width side
 * does not stack, so the fixed column crushes the main one at ~375px. 1.7 is the
 * primitive's first real composition (the homepage hero + credibility band), so
 * the stacking fix lands here.
 *
 * The fixed width has to survive a breakpoint, which an inline `style` width
 * cannot express — hence the CSS custom property + a static per-breakpoint class.
 */

function render(node: React.ReactElement) {
  return renderToStaticMarkup(node);
}

describe("TwoColumn", () => {
  it("stacks to a single column by default and becomes a row at lg", () => {
    const html = render(<TwoColumn main={<p>main</p>} side={<p>side</p>} />);
    expect(html).toContain("flex-col");
    expect(html).toContain("lg:flex-row");
  });

  it("gives the side full width when stacked and the fixed width above the breakpoint", () => {
    const html = render(<TwoColumn main={<p>main</p>} side={<p>side</p>} sideWidth={420} />);
    expect(html).toContain("w-full");
    expect(html).toContain("lg:w-[var(--gl-side-w)]");
    expect(html).toContain("--gl-side-w:420px");
  });

  it("defaults the side width to 360", () => {
    const html = render(<TwoColumn main={<p>main</p>} side={<p>side</p>} />);
    expect(html).toContain("--gl-side-w:360px");
  });

  it("honours a custom stackAt breakpoint and does not emit the default one", () => {
    const html = render(<TwoColumn main={<p>main</p>} side={<p>side</p>} stackAt="md" />);
    expect(html).toContain("md:flex-row");
    expect(html).toContain("md:w-[var(--gl-side-w)]");
    expect(html).not.toContain("lg:flex-row");
  });

  it("keeps the main column able to shrink (min-w-0) and fill (flex-1)", () => {
    // Without min-w-0 a long unbroken string in `main` blows the flex container out.
    const html = render(<TwoColumn main={<p>main</p>} side={<p>side</p>} />);
    expect(html).toContain("min-w-0");
    expect(html).toContain("flex-1");
  });

  it("never uses justify-between to right-align the side column", () => {
    // DESIGN.md § Do's and Don'ts: `space_between` + a fit-content child
    // mis-resolves and overflows. Fixed-width side is the sanctioned pattern.
    const html = render(<TwoColumn main={<p>main</p>} side={<p>side</p>} />);
    expect(html).not.toContain("justify-between");
  });

  it("renders both slots and passes className through", () => {
    const html = render(<TwoColumn main={<p>MAIN</p>} side={<p>SIDE</p>} className="mt-8" />);
    expect(html).toContain("MAIN");
    expect(html).toContain("SIDE");
    expect(html).toContain("mt-8");
  });
});
