import type { LeadExportRow } from "@/server/repositories/lead";

/**
 * Lead CSV serialization (Story 4.7, FR36a). PURE — no DB, no request — so it is
 * unit-testable and the export route just streams its output.
 *
 * TWO escaping layers, both mandatory for EXPORTED USER-SUBMITTED data:
 *  1. RFC-4180 quoting — a field containing a comma, quote, CR or LF is wrapped in
 *     double quotes with internal quotes doubled.
 *  2. CSV FORMULA-INJECTION guard — a field whose first character is `= + - @`
 *     (or a tab/CR) is prefixed with a single quote, so a spreadsheet opens
 *     `=cmd|...` as text, not a formula. The buyer controls company/name/message
 *     text; without this, a lead export is a spreadsheet-injection vector.
 */

const COLUMNS: { header: string; value: (r: LeadExportRow) => string }[] = [
  { header: "Reference", value: (r) => r.reference },
  { header: "Received", value: (r) => r.createdAt.toISOString() },
  { header: "Status", value: (r) => r.status },
  { header: "Source", value: (r) => r.source },
  { header: "Company", value: (r) => r.company },
  { header: "Name", value: (r) => r.name },
  { header: "Email", value: (r) => r.email },
  { header: "Phone", value: (r) => r.phone ?? "" },
  { header: "Country", value: (r) => r.country ?? "" },
  { header: "Locale", value: (r) => r.locale ?? "" },
  { header: "Industry", value: (r) => r.industry ?? "" },
  { header: "Equipment", value: (r) => r.equipment },
  { header: "Project details", value: (r) => r.projectDetails ?? "" },
  { header: "Quantities", value: (r) => r.quantities ?? "" },
  { header: "Timeline", value: (r) => r.timeline ?? "" },
  { header: "Consent", value: (r) => (r.consent ? "yes" : "no") },
  { header: "Consent at", value: (r) => (r.consentAt ? r.consentAt.toISOString() : "") },
  { header: "Consent version", value: (r) => r.consentVersion ?? "" },
  { header: "Attachment", value: (r) => r.attachmentName ?? "" },
  { header: "Attachment scan", value: (r) => r.attachmentScanStatus ?? "" },
  { header: "Notified at", value: (r) => (r.notifiedAt ? r.notifiedAt.toISOString() : "") },
  {
    header: "Confirmation sent at",
    value: (r) => (r.confirmationSentAt ? r.confirmationSentAt.toISOString() : ""),
  },
  { header: "Delivery failure", value: (r) => r.deliveryFailureReason ?? "" },
];

/** Neutralize a spreadsheet formula trigger, then RFC-4180-quote if needed. */
export function csvCell(raw: string): string {
  // Formula-injection guard FIRST (before quoting), on the raw leading char.
  let value = raw;
  if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
  if (/[",\r\n]/.test(value)) value = `"${value.replaceAll('"', '""')}"`;
  return value;
}

/** Serialize export rows to a CSV string (CRLF line endings per RFC-4180). */
export function leadsToCsv(rows: readonly LeadExportRow[]): string {
  const lines: string[] = [];
  lines.push(COLUMNS.map((c) => csvCell(c.header)).join(","));
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => csvCell(c.value(row))).join(","));
  }
  return lines.join("\r\n");
}
