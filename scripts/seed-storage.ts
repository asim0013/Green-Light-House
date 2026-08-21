import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";

/**
 * Storage fixture seeder (Story 2.3) — `npx tsx scripts/seed-storage.ts`.
 *
 * Creates the `S3_BUCKET` bucket if absent and uploads two SMALL, REAL PDFs at
 * the keys the Prisma seed's Document rows point to. Idempotent: re-running
 * overwrites the same keys.
 *
 * SCOPE: a dev/e2e fixture enabler ONLY. The full media-library bucket bootstrap
 * (policies, lifecycle, media paths) remains Story 4.5's — see the 1.1 defer in
 * deferred-work.md. The PDFs are GENERATED here, not checked into git: a minimal
 * one-page PDF is a few hundred bytes of plain text.
 */

/** A minimal but valid one-page PDF displaying `label`. */
function tinyPdf(label: string): Buffer {
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

const FIXTURES = [
  { key: "docs/fd-9500-datasheet-v1.pdf", label: "FD-9500 Datasheet (fixture)" },
  { key: "docs/fd-9500-en54-v1.pdf", label: "FD-9500 EN 54 Certificate (fixture)" },
];

async function main() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set — copy .env.example to .env first.");

  const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    console.log(`bucket ${bucket}: exists`);
  } catch {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`bucket ${bucket}: created`);
  }

  for (const { key, label } of FIXTURES) {
    const pdf = tinyPdf(label);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: pdf,
        ContentType: "application/pdf",
      }),
    );
    console.log(`uploaded ${key} (${pdf.length} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
