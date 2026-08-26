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

/** One lazily-built S3 client for the read helpers below. Imported lazily so a
 *  missing dependency cannot break test collection (the rule this file
 *  already followed inside `probeStorageReady`). */
async function s3Client() {
  loadEnv();
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? "us-east-1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
    },
  });
}

/**
 * AC9's STORAGE-LAYER RETRIEVABILITY PROBE (Story 3.7b).
 *
 * Story 3.7b ships no route that serves a quarantined attachment — deliberately
 * (Story 4.7 owns that, behind 4.1's auth). So "the key we stored is the key
 * that can be read back" cannot be proven through the app at all. Asking
 * storage directly is what stops Story 4.7 discovering a wrong key months from
 * now, with no way to tell a bad key from a bad route.
 */
export async function storageKeyExists(key: string): Promise<boolean> {
  const { HeadObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client();
  try {
    await client.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  } finally {
    client.destroy();
  }
}

/** Every key under `prefix`. Used by the quarantine census in the pollution
 *  gate and by the "no object was written" half of the EICAR proof. */
export async function listStorageKeys(prefix: string): Promise<string[]> {
  const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
  const client = await s3Client();
  const keys: string[] = [];
  try {
    let token: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: process.env.S3_BUCKET,
          Prefix: prefix,
          ContinuationToken: token,
        }),
      );
      for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
  } catch {
    // Storage unreachable — the caller's assertion, not a connection error, is
    // what should fail.
  } finally {
    client.destroy();
  }
  return keys;
}

/** Remove one object. The attachment e2e cleans up after itself, so a run does
 *  not leave real files in the bucket for the next one to trip over. */
export async function deleteStorageKey(key: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await s3Client();
  try {
    await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  } catch {
    // Best effort: the pollution gate reports whatever survives.
  } finally {
    client.destroy();
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
