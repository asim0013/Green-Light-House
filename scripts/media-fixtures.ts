import { deflateSync } from "node:zlib";

/**
 * Project-photo fixtures (Story 3.1), shared by `prisma/seed.ts` and
 * `scripts/seed-storage.ts`.
 *
 * SHARED FOR THE SAME REASON `doc-fixtures.ts` IS: the seed writes the storage
 * KEY into `Project.media` and the storage seeder uploads an object AT that key.
 * Two hand-copied lists would drift the moment one changed, and the symptom —
 * a photo band that renders a broken image — is exactly what FR21 forbids.
 *
 * THE IMAGES ARE GENERATED, NOT COMMITTED. A solid-colour PNG is a few KB from
 * `node:zlib` alone, so there is no binary in git and no new dependency. They are
 * real, decodable PNGs rather than placeholder bytes, because `next/image` and the
 * browser both actually decode them.
 */

export interface MediaFixture {
  /** The object-storage key, written into `Project.media[].storageKey`. */
  key: string;
  /** The media entry id — SLUG-SHAPED, because it becomes a URL path segment. */
  id: string;
  /** Allowlisted by `SAFE_IMAGE_MIME`; SVG is rejected at the parse boundary. */
  mime: "image/png";
  /** EN alt text. Required — it is the fallback source for every other locale. */
  altEn: string;
  /** TR alt text, so the per-locale alt path has a real fixture to exercise. */
  altTr: string;
  /** Fill colour, purely so the two fixtures are visually distinguishable. */
  rgb: [number, number, number];
}

export const MEDIA_FIXTURES: readonly MediaFixture[] = [
  {
    key: "projects/hospital-fire-suppression/overview.png",
    id: "overview",
    mime: "image/png",
    altEn: "Clean-agent suppression skid installed in the hospital plant room",
    altTr: "Hastane makine dairesine kurulan temiz gazlı söndürme ünitesi",
    rgb: [30, 58, 74],
  },
  {
    key: "projects/hospital-fire-suppression/panel.png",
    id: "control-panel",
    mime: "image/png",
    altEn: "Addressable fire alarm control panel during commissioning",
    altTr: "Devreye alma sırasında adreslenebilir yangın alarm paneli",
    rgb: [58, 74, 30],
  },
];

function crcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = crcTable();

function crc32(buffer: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** One PNG chunk: length, type, data, CRC over type+data. */
function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed));
  return Buffer.concat([length, typed, crc]);
}

/**
 * A real, decodable solid-colour PNG.
 *
 * 8-bit RGB, no interlace. Each scanline is a filter byte (0 = None) followed by
 * `width` RGB triples; the whole lot is zlib-deflated into one IDAT. A flat colour
 * compresses to a couple of KB even at 1200x800, which is why generating is
 * cheaper than committing a binary.
 */
export function solidPng(
  width: number,
  height: number,
  [r, g, b]: [number, number, number],
): Buffer {
  const stride = width * 3 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride;
    raw[row] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const px = row + 1 + x * 3;
      raw[px] = r;
      raw[px + 1] = g;
      raw[px + 2] = b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG signature
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** The dimensions every fixture is generated at — a plausible landscape photo. */
export const FIXTURE_WIDTH = 1200;
export const FIXTURE_HEIGHT = 800;
