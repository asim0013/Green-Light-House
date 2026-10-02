// @vitest-environment node
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet, ImportParseError } from "./parse";

/** Build a real .xlsx buffer (round-trip: write with exceljs, then parse it). */
async function makeXlsx(rows: string[][]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  for (const r of rows) ws.addRow(r);
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("parseSpreadsheet", () => {
  it("maps xlsx rows by header name, order-independent", async () => {
    const buf = await makeXlsx([
      ["slug", "model", "name_en"],
      ["fd-9500", "FD-9500", "Flame detector"],
      ["fd-9600", "FD-9600", "Detector two"],
    ]);
    const rows = await parseSpreadsheet(buf, "xlsx");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ slug: "fd-9500", model: "FD-9500", name_en: "Flame detector" });
    expect(rows[1].slug).toBe("fd-9600");
  });

  it("skips fully-blank rows and trims cell text", async () => {
    const buf = await makeXlsx([
      ["slug", "name_en"],
      [" a ", " A "],
      ["", ""],
      ["b", "B"],
    ]);
    const rows = await parseSpreadsheet(buf, "xlsx");
    expect(rows.map((r) => r.slug)).toEqual(["a", "b"]); // blank row dropped, values trimmed
  });

  it("parses csv the same way", async () => {
    const csv = "slug,model,name_en\r\nfd-1,M1,Name one\r\n";
    const rows = await parseSpreadsheet(new TextEncoder().encode(csv), "csv");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ slug: "fd-1", model: "M1", name_en: "Name one" });
  });

  it("throws ImportParseError on a header-less file", async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("empty"); // a worksheet with no rows → no header cells
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());
    await expect(parseSpreadsheet(buf, "xlsx")).rejects.toBeInstanceOf(ImportParseError);
  });
});
