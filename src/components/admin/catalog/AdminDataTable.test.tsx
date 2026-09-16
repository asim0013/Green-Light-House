import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminDataTable } from "./AdminDataTable";

/**
 * The reusable admin list table (Story 4.3). Pins the accessibility contract it
 * inherits from `ProjectBomTable`: a real semantic table with a caption and
 * `scope`-tagged headers, a row-header column, and a graceful empty state.
 */
interface Row {
  id: string;
  name: string;
  slug: string;
}
const rows: Row[] = [
  { id: "1", name: "Bosch", slug: "bosch" },
  { id: "2", name: "Honeywell", slug: "honeywell" },
];
const columns = [
  { header: "Name", rowHeader: true, cell: (r: Row) => r.name },
  { header: "Slug", cell: (r: Row) => r.slug },
];

const render = (data: Row[]) =>
  renderToStaticMarkup(
    <AdminDataTable
      caption="Manufacturers"
      captionId="cap"
      rows={data}
      getRowKey={(r) => r.id}
      empty="Nothing yet."
      columns={columns}
    />,
  );

describe("AdminDataTable", () => {
  it("renders a semantic table with a caption and column scopes", () => {
    const h = render(rows);
    expect(h).toContain("<table");
    expect(h).toContain('<caption id="cap"');
    expect(h).toContain("Manufacturers");
    // P5: drop scope="col" from the header and this reddens.
    expect(h).toContain('scope="col"');
  });

  it("renders the row-header column as th scope=row (not a td)", () => {
    const h = render(rows);
    expect(h).toContain('scope="row"');
    expect(h).toContain("Bosch");
    expect(h).toContain("Honeywell");
  });

  it("does NOT use flex/grid utilities on table elements (strips roles)", () => {
    // The a11y rule from ProjectBomTable. P5: add `flex` to a <td> and this reddens.
    const h = render(rows);
    const tableFragment = h.slice(h.indexOf("<table"));
    expect(/<t[dh][^>]*class="[^"]*\b(?:flex|grid)\b/.test(tableFragment)).toBe(false);
  });

  it("shows the empty message when there are no rows", () => {
    const h = render([]);
    expect(h).toContain("Nothing yet.");
    expect(h).not.toContain("<table");
  });
});
