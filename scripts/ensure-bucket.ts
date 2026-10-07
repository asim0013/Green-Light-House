import { S3Client, HeadBucketCommand, CreateBucketCommand } from "@aws-sdk/client-s3";

/**
 * Production bootstrap: make sure the `S3_BUCKET` bucket exists — and NOTHING else.
 *
 * `scripts/seed-storage.ts` also creates the bucket, but it uploads demo fixture
 * PDFs for the seeded catalog; production must not get those. This is the
 * bucket-only half, run by the `init` service in docker-compose.prod.yml on every
 * deploy (idempotent).
 *
 * Same rule as seed-storage (2.3 review): HeadBucket answers 404 for "absent" and
 * 401/403 for "your credentials are wrong" — only a genuine absence creates; an
 * auth failure fails loudly instead of turning into a confusing CreateBucket error.
 */
async function main(): Promise<void> {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not set.");

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
    console.log(`[ensure-bucket] ${bucket}: exists`);
    return;
  } catch (error) {
    const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status !== 404 && status !== undefined) {
      throw new Error(`Cannot reach bucket "${bucket}" (HTTP ${status}). Check S3_* settings.`, {
        cause: error,
      });
    }
  }
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  console.log(`[ensure-bucket] ${bucket}: created`);
}

main().catch((error: unknown) => {
  console.error("[ensure-bucket] failed:", error);
  process.exit(1);
});
