/**
 * Decide whether the document-download e2e assertions can run (Story 2.3;
 * rewritten in the 2.3 review).
 *
 * THE BUG THIS FIXES — the same one `dbReady.ts` documents from Story 1.7, made
 * again one story later. The original probe was
 * `GET /api/documents/fd-9500-datasheet`, i.e. a request THROUGH the download
 * handler under test, and `storageReady = res.status() === 200`. So any bug in
 * the handler's success path read as "environment not ready" and SKIPPED the one
 * test proving downloads work — with a skip reason blaming the fixtures.
 *
 * Reproduced by the review: with a wrong-key bug live in the handler (storage
 * healthy, both fixture objects verified present in MinIO), the suite reported
 * `1 skipped / 7 passed`, exit 0 — the keystone AC1 test excusing itself while
 * the endpoint was broken. Worse, two runs at the default 4 workers skipped that
 * same test on a HEALTHY endpoint, the 15s probe simply timing out under
 * contention.
 *
 * So the skip predicate depends on the ENVIRONMENT only. We ask MinIO directly,
 * exactly as `probeDbReady` asks Postgres directly:
 *   - fixture object absent / S3 unreachable → skip (seed-storage was not run)
 *   - fixture object present                 → RUN, whatever the handler does.
 *                                              A 500 is then a red test, which is
 *                                              the entire point of the test.
 *
 * The app is never involved, so a broken route can no longer buy itself a skip.
 */

/** The object the download tests assert against — written by scripts/seed-storage.ts. */
const FIXTURE_KEY = "docs/fd-9500-datasheet-v1.pdf";

let cached: boolean | undefined;

/** Load `.env` so the S3_* vars are available (Playwright does not do this for us). */
function loadEnv(): void {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (path?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // No .env — the S3_* vars may still come from the ambient environment.
  }
}

/**
 * True when the seeded storage fixture is reachable in object storage itself.
 * Independent of the app: this never issues an HTTP request to the site.
 */
export async function probeStorageReady(): Promise<boolean> {
  if (cached !== undefined) return cached;
  loadEnv();

  try {
    // Imported lazily so a missing dependency cannot break test collection.
    const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
    const client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
    try {
      await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: FIXTURE_KEY }));
      cached = true;
    } finally {
      client.destroy();
    }
  } catch {
    cached = false;
  }

  return cached;
}
