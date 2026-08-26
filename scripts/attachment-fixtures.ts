/**
 * Attachment fixtures (Story 3.7b) — shared by the unit tests under `src/` and
 * the Playwright suite under `e2e/`, which is why they live here rather than
 * beside either one. `doc-fixtures.ts` and `media-fixtures.ts` set the
 * precedent: generate small real files, never commit binaries.
 *
 * ⚠️ EICAR HYGIENE IS THE POINT OF THIS FILE (Task 0 #14). The EICAR test
 * signature is defined BY its 68 bytes, so any file containing them is
 * quarantined by the developer's own AV, by GitHub's scanners and by CI
 * runners. It is therefore ASSEMBLED AT RUNTIME from fragments and never
 * written down — not here, not in a test, not in a story record, not in a
 * review note. `eicarSignature()` asserts the byte length instead of asserting
 * the text, because asserting the text would require writing the text.
 *
 * ⚠️ THE BACKSLASH IS BUILT BY CHAR CODE, DELIBERATELY. A `\\` inside a shell
 * heredoc collapses to a single `\`, which JS then drops as an unrecognised
 * escape — that silently produced a 67-byte near-miss that clamd correctly
 * reported as CLEAN, which would have read as "the scanner is broken". Measured
 * and fixed during implementation; do not "simplify" it back to a literal.
 */

/** The 68-byte EICAR test signature, assembled at call time. Never stored. */
export function eicarSignature(): Buffer {
  const parts = [
    "X5O!P%@AP[4",
    String.fromCharCode(92),
    "PZX54(P^)7CC)7}",
    "$EICAR-STAN",
    "DARD-ANTIVIRUS-TEST-F",
    "ILE!$H+H*",
  ];
  const signature = Buffer.from(parts.join(""), "latin1");
  // The identity check that does not require writing the identity down. A
  // mis-assembled signature scans CLEAN, which would look like a scanner fault.
  if (signature.length !== 68) {
    throw new Error(`EICAR fixture assembled to ${signature.length} bytes, expected 68`);
  }
  return signature;
}

/**
 * A valid PDF whose body carries the signature inside a real `stream` object.
 *
 * ⚠️ THIS SHAPE WAS CHOSEN FROM MEASUREMENT, AND IT CONTRADICTS THE STORY'S OWN
 * INSTRUCTION. AC13 said to "give the fixture a valid PDF magic prefix so it
 * passes validation and MUST reach clamd". Measured against the live container
 * (ClamAV 1.5.3/28104), a bare `%PDF-` + signature concatenation is reported
 * **`stream: OK`** — clamd types the buffer as a PDF, runs the PDF parser, and
 * the signature never fires. So does `%PDF-1.4\n` + signature + `%%EOF`. The
 * fixture the AC prescribed could not have passed; the trap the AC warns about
 * (a test that never reaches the scanner) had a sibling one layer down (a test
 * that reaches the scanner and is waved through).
 *
 * What IS detected, measured the same way:
 *   - the signature inside a PDF `stream` object → `Eicar-Signature FOUND`
 *   - the signature as a member of a real ZIP     → `Eicar-Test-Signature FOUND`
 * This function is the first; `eicarXlsx()` is the second.
 */
export function eicarPdf(): Buffer {
  const signature = eicarSignature();
  const head = Buffer.from(
    ["%PDF-1.4", "1 0 obj", `<< /Length ${signature.length} >>`, "stream", ""].join("\n"),
    "latin1",
  );
  const tail = Buffer.from(["", "endstream", "endobj", "%%EOF", ""].join("\n"), "latin1");
  return Buffer.concat([head, signature, tail]);
}

/** The archive-path variant: a real OPC-shaped ZIP with the signature inside. */
export function eicarXlsx(): Buffer {
  return storedZip([
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES_XML, "latin1") },
    { name: "xl/worksheets/sheet1.xml", data: eicarSignature() },
  ]);
}

/** A small, structurally valid PDF that no scanner objects to. */
export function cleanPdf(label = "GLH attachment fixture"): Buffer {
  const body = `%PDF-1.4\n1 0 obj\n<< /Length ${label.length} >>\nstream\n${label}\nendstream\nendobj\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';

/** A clean OPC-shaped workbook: ZIP magic AND the content-types part. */
export function cleanXlsx(): Buffer {
  return storedZip([
    { name: "[Content_Types].xml", data: Buffer.from(CONTENT_TYPES_XML, "latin1") },
    { name: "xl/workbook.xml", data: Buffer.from("<workbook/>", "latin1") },
  ]);
}

/**
 * A REAL ZIP that is not an OPC package — the disguised-`.xlsx` case the story
 * asks the validator tests to feed it. Magic bytes alone accept this; the
 * `[Content_Types].xml` scan is what rejects it. Feeding a file that fails on
 * its EXTENSION instead would prove nothing about the magic-byte layer.
 */
export function plainZip(): Buffer {
  return storedZip([{ name: "readme.txt", data: Buffer.from("not a workbook", "latin1") }]);
}

/** A clean DWG: the 6-byte version string plus filler. */
export function cleanDwg(version = "AC1027"): Buffer {
  return Buffer.concat([Buffer.from(version, "latin1"), Buffer.alloc(64, 0x20)]);
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * A minimal STORED (uncompressed) ZIP writer — local headers, central
 * directory, end-of-central-directory. Zero dependencies, the same
 * generate-don't-commit stance as `solidPng` in `media-fixtures.ts`.
 *
 * Uncompressed on purpose: a fixture whose bytes are literally the bytes the
 * test put in is one a reader can reason about, and deflate would add a second
 * thing that could be wrong when a scan result surprises someone.
 */
export function storedZip(entries: readonly ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "latin1");
    const crc = crc32(data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(data.length, 18); // compressed size (stored)
    localHeader.writeUInt32LE(data.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuf.length, 26);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // central directory signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt32LE(offset, 42);

    locals.push(localHeader, nameBuf, data);
    central.push(centralHeader, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuf, end]);
}
