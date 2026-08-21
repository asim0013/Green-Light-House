/**
 * The document fixture set, shared by `scripts/seed-storage.ts` (which uploads
 * the objects) and `prisma/seed.ts` (which records their metadata).
 *
 * WHY THIS MODULE EXISTS (2.3 review). The two seeds used to agree only by hand:
 * seed-storage generated the PDFs at runtime while seed.ts hardcoded
 * `sizeBytes: 602` / `610` under a comment promising "the sizes match what
 * seed-storage actually uploads". Nothing enforced that promise, and the whole
 * test suite was blind to a break — the link text and the e2e assertion both read
 * the same DB number, so they agree with each other even when both are wrong
 * about the file on disk.
 *
 * Measured: renaming a fixture label from "EN 54" to "EN 54-10" makes the real
 * object 613 bytes while the DB, the rendered link and the e2e all keep saying
 * "610 B" — a visible lie at byte granularity, with every gate green. That is
 * exactly the "shipped lies" failure `lib/doc-meta.ts` says the design exists to
 * prevent.
 *
 * So the byte count is now DERIVED from the same function that produces the
 * bytes. `sizeBytes` cannot drift from the uploaded object, because both come
 * from `tinyPdf(label)`.
 */

/** A minimal but valid one-page PDF displaying `label`. */
export function tinyPdf(label: string): Buffer {
  const content = `BT /F1 18 Tf 72 720 Td (${label}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefStart = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

export interface DocFixture {
  /** The stored object key — what a Document row's `fileKey` points at. */
  key: string;
  /** Rendered into the PDF, and the reason its byte count is what it is. */
  label: string;
}

export const DOC_FIXTURES: readonly DocFixture[] = [
  { key: "docs/fd-9500-datasheet-v1.pdf", label: "FD-9500 Datasheet (fixture)" },
  { key: "docs/fd-9500-en54-v1.pdf", label: "FD-9500 EN 54 Certificate (fixture)" },
];

/**
 * The exact byte length `seed-storage` uploads for a key — the value a Document
 * row's `sizeBytes` must carry. Throws on an unknown key rather than guessing:
 * a silent 0 would put the lie straight back.
 */
export function fixtureSize(key: string): number {
  const fixture = DOC_FIXTURES.find((f) => f.key === key);
  if (!fixture) throw new Error(`No document fixture registered for key "${key}"`);
  return tinyPdf(fixture.label).length;
}
