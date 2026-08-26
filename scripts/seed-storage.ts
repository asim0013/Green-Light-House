import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { DOC_FIXTURES, tinyPdf } from "./doc-fixtures";
import { MEDIA_FIXTURES, solidPng, FIXTURE_WIDTH, FIXTURE_HEIGHT } from "./media-fixtures";

/**
 * Storage fixture seeder (Story 2.3) — `npx tsx scripts/seed-storage.ts`.
 *
 * Creates the `S3_BUCKET` bucket if absent and uploads a SMALL, REAL PDF at each
 * key the Prisma seed's Document rows point to. Idempotent: re-running
 * overwrites the same keys.
 *
 * SCOPE: a dev/e2e fixture enabler ONLY. The full media-library bucket bootstrap
 * (policies, lifecycle, media paths) remains Story 4.5's — see the 1.1 defer in
 * deferred-work.md. The PDFs are GENERATED here, not checked into git: a minimal
 * one-page PDF is a few hundred bytes of plain text.
 *
 * The fixture list and the PDF generator live in `./doc-fixtures.ts` because
 * `prisma/seed.ts` derives `sizeBytes` from the very same bytes — see that file
 * for why hand-copied sizes were a latent lie.
 */

/**
 * Load `.env` for standalone runs. `prisma db seed` gets this for free from the
 * Prisma CLI; `npx tsx scripts/seed-storage.ts` does not, so the documented
 * command failed with "S3_BUCKET is not set" on a machine whose .env was
 * perfectly correct (2.3 review).
 *
 * AMBIENT ENVIRONMENT WINS: only consulted when the vars are absent, so CI's
 * job-level `env:` block is never overridden by a stray committed .env.
 */
function loadEnv(): void {
  if (process.env.S3_BUCKET) return;
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // No .env — the S3_* vars may still come from the ambient environment.
  }
}

async function main() {
  loadEnv();
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

  // HeadBucket answers 404 for "absent" and 401/403 for "your credentials are
  // wrong" — collapsing both into "create it" turned an auth failure into a
  // confusing CreateBucket error (2.3 review). Only a genuine absence creates.
  let exists = false;
  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    exists = true;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404 && status !== undefined) {
      throw new Error(
        `Cannot reach bucket "${bucket}" (HTTP ${status}). Check S3_ENDPOINT and credentials.`,
        { cause: error },
      );
    }
  }

  if (exists) {
    console.log(`bucket ${bucket}: exists`);
  } else {
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`bucket ${bucket}: created`);
  }

  for (const { key, label } of DOC_FIXTURES) {
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

  /**
   * Project photos (Story 3.1). Before this, the bucket held ZERO images and both
   * seeded projects had an empty `media` column — so the photo branch of the
   * project page had no fixture at all and every assertion about it would have
   * been vacuous. Same generated-not-committed approach as the PDFs above; the
   * keys come from the SAME module `prisma/seed.ts` writes into `Project.media`,
   * so the two cannot drift.
   */
  for (const { key, mime, rgb } of MEDIA_FIXTURES) {
    const png = solidPng(FIXTURE_WIDTH, FIXTURE_HEIGHT, rgb);
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: png, ContentType: mime }));
    console.log(`uploaded ${key} (${png.length} bytes)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
