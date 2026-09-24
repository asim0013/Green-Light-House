import { describe, it, expect } from "vitest";
import type { LeadExportRow } from "@/server/repositories/lead";
import { csvCell, leadsToCsv } from "./csv";

describe("csvCell", () => {
  it("neutralizes formula-injection triggers with a leading quote", () => {
    expect(csvCell("=cmd|' /C calc'!A1")).toBe("'=cmd|' /C calc'!A1"); // no comma/quote → no RFC quoting
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("RFC-4180-quotes commas, quotes and newlines", () => {
    expect(csvCell("Acme, Inc")).toBe('"Acme, Inc"');
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("leaves plain text untouched", () => {
    expect(csvCell("Bosch")).toBe("Bosch");
    expect(csvCell("")).toBe("");
  });

  it("applies BOTH guards: a formula that also contains a comma", () => {
    // leading '=' → prefix quote, then the comma forces RFC quoting of the whole cell.
    expect(csvCell("=A1,B2")).toBe('"\'=A1,B2"');
  });
});

describe("leadsToCsv", () => {
  const row: LeadExportRow = {
    reference: "GLH-RFQ-2001",
    createdAt: new Date("2026-09-24T10:00:00.000Z"),
    status: "new",
    source: "product",
    company: "Acme, Inc",
    name: "Aylin",
    email: "a@example.com",
    phone: null,
    country: "TR",
    locale: "en",
    industry: "oil-gas",
    equipment: "FD-9500; custom skid",
    projectDetails: "=danger", // formula-injection attempt in a free-text field
    quantities: null,
    timeline: null,
    consent: true,
    consentAt: new Date("2026-09-24T10:00:00.000Z"),
    consentVersion: "1:en",
    attachmentName: "spec.pdf",
    attachmentScanStatus: "clean",
    notifiedAt: null,
    confirmationSentAt: null,
    deliveryFailureReason: null,
  };

  it("emits a header + one row per lead, CRLF-separated, with both escapes applied", () => {
    const csv = leadsToCsv([row]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Reference,Received,Status");
    expect(lines[1]).toContain('"Acme, Inc"'); // comma quoted
    expect(lines[1]).toContain("'=danger"); // formula neutralized
    expect(lines[1]).toContain("GLH-RFQ-2001");
  });

  it("emits header only for an empty set", () => {
    expect(leadsToCsv([]).split("\r\n")).toHaveLength(1);
  });
});
