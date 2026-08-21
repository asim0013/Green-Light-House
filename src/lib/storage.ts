import { S3Client, GetObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";

/**
 * S3-compatible object storage (Story 2.3) — the architecture's `lib/ storage(S3)`
 * module (architecture:180). MinIO in dev, R2-shaped for prod; the client is the
 * AWS SDK v3 because the architecture names no library (verified) and this one
 * speaks both dialects (`forcePathStyle` is the MinIO switch).
 *
 * Lazy singleton, same reason as `lib/db.ts`: construct on first use, reuse across
 * requests, and never at MODULE LOAD — importing this file must stay free of env
 * reads so the DB-free build cannot trip over missing S3 config.
 *
 * ERROR CONTRACT: callers get `null` for a missing OBJECT (the row-exists/
 * object-gone case is the caller's 404) and a thrown error for everything else
 * (misconfiguration, network) — which the route handler turns into a LOGGED 404
 * that never echoes `S3_ENDPOINT` or any storage topology to the client.
 */

let client: S3Client | null = null;

function s3(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "us-east-1",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      },
    });
  }
  return client;
}

export interface StoredObject {
  /** A web ReadableStream of the object body, pipeable straight into Response. */
  stream: ReadableStream;
  /** Byte length as stored, when the backend reports it. */
  contentLength: number | undefined;
}

/**
 * Fetch one object as a web stream, or `null` when the KEY does not exist.
 * Anything else (bad credentials, unreachable endpoint, missing bucket) throws —
 * those are operator errors, not 404s, and the caller decides how much to say.
 */
export async function getObjectStream(key: string): Promise<StoredObject | null> {
  try {
    const out = await s3().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    if (!out.Body) return null;
    // SDK v3 on Node 18+: Body is a runtime-specific stream with a web-stream
    // adapter. `transformToWebStream` hands back exactly what Response accepts.
    const stream = out.Body.transformToWebStream() as ReadableStream;
    return { stream, contentLength: out.ContentLength };
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    // `NoSuchKey` is not always typed — MinIO surfaces some misses as generic
    // errors with a 404 status. Treat any 404-shaped service error as a miss.
    if (
      typeof error === "object" &&
      error !== null &&
      "$metadata" in error &&
      (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404
    ) {
      return null;
    }
    throw error;
  }
}
