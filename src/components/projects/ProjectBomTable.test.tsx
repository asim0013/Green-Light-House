import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * The scope-of-supply table (Story 3.1b — AC2). The site's FIRST table, and the
 * component `epics:712` says Epic 4's Admin Inquiries table inherits — so its
 * accessibility contract is pinned here rather than left to inspection.
 *
 * ⚠️ NOTHING IN THE TOOLCHAIN CAN CATCH A TABLE DEFECT. Measured: zero `<table>`
 * elements existed in `src/` before this component, and `eslint-config-next`
 * enables six `jsx-a11y` rules, none covering tables. Every assertion below
 * stands in for a gate that does not exist.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values && "count" in values ? `${key}:${values.count}` : key,
  useFormatter: () => ({ number: (n: number) => String(n) }),
}));

const { ProjectBomTable } = await import("./ProjectBomTable");

import type { ProjectBomLineItem } from "@/server/repositories/project";

function line(over: Partial<ProjectBomLineItem> = {}): ProjectBomLineItem {
  return {
    id: "l1",
    label: "Triple-IR flame detection",
    labelIsFallback: false,
    model: "FD-9500",
    manufacturer: "Detronics",
    quantity: 142,
    ...over,
  };
}

/** The canvas's five lines. 142+88+60+24+3 = 317. */
const FIVE: ProjectBomLineItem[] = [
  line(),
  line({ id: "l2", model: "GD-410", quantity: 88 }),
  line({ id: "l3", model: "XB-200", quantity: 60 }),
  line({ id: "l4", model: "AS-60", quantity: 24 }),
  line({ id: "l5", model: "FM-200 skid", quantity: 3, manufacturer: null }),
];

describe("ProjectBomTable — the footer is DERIVED", () => {
  /**
   * ⚠️ TWO FIXTURES, AND THAT IS THE WHOLE POINT OF THIS TEST.
   *
   * The story's FIRST DRAFT specified the mutation as "hard-code `5 line items`
   * and it reddens when the fixture changes to 4" — which CANNOT redden: the seed
   * has exactly five lines and no task changes it, so the literal would match
   * forever. That is precisely the "test that cannot fail" §J defines and §K
   * lists as a recurrence this project keeps shipping. Rendering the component
   * against a 3-line AND a 5-line prop set makes the mutation executable against
   * the delivered code alone.
   *
   * P5: replace `lines.length` with the literal `5` and the 3-line case reddens.
   * P5: replace the `reduce` with the literal `317` and the 3-line case reddens.
   */
  it("counts the lines it was given, not a literal", () => {
    const five = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    expect(five).toContain("bomLineItems:5");
    expect(five).toContain("bomUnitsTotal:317");

    const three = renderToStaticMarkup(<ProjectBomTable lines={FIVE.slice(0, 3)} />);
    expect(three).toContain("bomLineItems:3");
    expect(three).toContain("bomUnitsTotal:290");
  });

  it("renders one row per line, including the one with no product", () => {
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    expect(html.match(/<tr/g)).toHaveLength(7); // header + 5 body + footer
    expect(html).toContain("FM-200 skid");
  });

  it("renders an em-dash for a line with no published product — never a blank cell", () => {
    // The non-catalog line and an unpublished-product line take the SAME path,
    // so neither can leak an identity and neither leaves the column empty.
    const html = renderToStaticMarkup(<ProjectBomTable lines={[line({ manufacturer: null })]} />);
    expect(html).toContain("—");
  });
});

describe("ProjectBomTable — the accessibility contract nothing else enforces", () => {
  it("is a semantic table with a caption and column scopes", () => {
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    expect(html).toContain("<table");
    expect(html).toContain("<caption");
    // Four column headers. Without `scope` a screen reader cannot associate a
    // cell with its column, which is the entire reason this is a table.
    expect(html.match(/scope="col"/g)).toHaveLength(4);
  });

  it("makes each row's label a row header", () => {
    // `scope="row"` on the CATEGORY cell is what lets a screen reader announce
    // which line a quantity belongs to.
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    // 5 body rows + the footer's summary header.
    expect(html.match(/scope="row"/g)).toHaveLength(6);
  });

  it("⚠️ the scroller is a NAMED REGION, not a bare focusable div", () => {
    // `tabIndex={0}` + `aria-label` on a plain div yields role=generic, and
    // name-from-author is NOT exposed on generic roles — the name would be
    // silently dropped. The region role is what makes it reachable, and it
    // points at the caption so the name and the caption are one string.
    // P5: drop `role="region"` and this reddens.
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} captionId="cap-1" />);
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-labelledby="cap-1"');
    expect(html).toContain('id="cap-1"');
    expect(html).toContain('tabindex="0"');
  });

  it("⛔ puts NO flex or grid utility on any table element", () => {
    /**
     * A `justify-between` on `<tfoot>`, `<tr>` or a cell strips the `row`/`cell`
     * roles from the accessibility tree in Chromium and Gecko — the footer stops
     * being part of the table for a screen reader, losing the "header + footer
     * summarize" contract EXPERIENCE.md:75 states for BOM tables. It renders
     * identically, so only an assertion can catch it.
     *
     * P5: put `flex justify-between` on the `<tr>` in `<tfoot>` and this reddens.
     */
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    const tableElements = html.match(/<(table|thead|tbody|tfoot|tr|th|td)[^>]*>/g) ?? [];
    const offenders = tableElements.filter((el) => /\b(flex|grid|justify-|items-)/.test(el));
    expect(offenders, "a flex/grid utility on a table element breaks its a11y roles").toEqual([]);
  });

  it("uses ink-2 for headers, never the muted token DESIGN.md prescribes", () => {
    /**
     * DESIGN.md:177 says "mono `muted` headers" on a `surface-2` row at 10-11px.
     * `muted` measures 2.89:1 there — an AA failure — and `ink-2` measures 5.60:1
     * (ratios recorded in `Kicker.tsx`). Implementing the spec literally ships a
     * contrast failure into the component Epic 4 inherits.
     *
     * P5: swap any header to `text-muted` and this reddens.
     */
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    expect(html).not.toContain("text-muted");
    expect(html).toContain("text-ink-2");
  });

  it("marks a fallen-back line label with lang and a notice", () => {
    // The label is authored, translated content, so it carries the same FR34a
    // treatment as the body copy: `lang` for a screen reader, a notice for a
    // sighted reader. P5: drop the `lang` and this reddens.
    const html = renderToStaticMarkup(
      <ProjectBomTable lines={[line({ labelIsFallback: true })]} />,
    );
    expect(html).toContain('lang="en"');
  });

  it("⚠️ carries the horizontal scroller — the whole reflow contract (WCAG 1.4.10) rests on it", () => {
    // Removing `overflow-x-auto` is a clean 1.4.10 failure that renders
    // identically at desktop width, so only an assertion catches it.
    // P5: drop `overflow-x-auto` from the scroll container and this reddens.
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    expect(html).toContain("overflow-x-auto");
  });

  it("carries a minimum width, or the scroller never engages", () => {
    // Without a floor the columns collapse to fit any viewport and the
    // horizontal scroll EXPERIENCE.md:159 requires never happens.
    const html = renderToStaticMarkup(<ProjectBomTable lines={FIVE} />);
    expect(html).toMatch(/min-w-\[\d+px\]/);
  });
});
