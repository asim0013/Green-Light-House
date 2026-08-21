import { S3Client, GetObjectCommand, HeadObjectCommand, NoSuchKey } from "@aws-sdk/client-s3";

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
 * (misconfiguration, network) — which the route handler turns into a LOGGED 503,
 * never echoing `S3_ENDPOINT` or any storage topology to the client.
 *
 * THE BUCKET IS NOT THE OBJECT (2.3 review). A missing/mistyped bucket answers
 * with HTTP 404 exactly like a missing key, so the old "any 404-shaped error is a
 * miss" rule quietly routed the single most likely operator error — a wrong
 * `S3_BUCKET` — into the data-integrity path, and every download logged
 * "object missing (key docs/…)" while the real fault was config. Measured:
 * NoSuchBucket carries `name = "NoSuchBucket"` and `$metadata.httpStatusCode =
 * 404`. Bucket-level codes are therefore excluded from the miss branch by name
 * BEFORE the status-shape fallback runs.
 */

/** Error codes that mean "the bucket is wrong", never "the object is gone". */
const BUCKET_LEVEL_CODES = new Set(["NoSuchBucket", "PermanentRedirect", "AccessDenied"]);

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

/** The validators a cache needs to revalidate, carried from the S3 response. */
export interface ObjectValidators {
  /** Byte length as stored, when the backend reports it. */
  contentLength: number | undefined;
  /** Opaque entity tag, quoted exactly as the backend returned it. */
  etag: string | undefined;
  lastModified: Date | undefined;
}

export interface StoredObject extends ObjectValidators {
  /** A web ReadableStream of the object body, pipeable straight into Response. */
  stream: ReadableStream;
}

/** The SDK error name, however this backend spells it. */
function errorName(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  const e = error as { name?: string; Code?: string };
  return e.name ?? e.Code ?? "";
}

function httpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
}

/**
 * True when the error means THIS KEY does not exist — as opposed to "the bucket
 * is wrong" or "the endpoint is down", which are operator errors and must throw.
 */
function isMissingKey(error: unknown): boolean {
  if (error instanceof NoSuchKey) return true;
  const name = errorName(error);
  if (BUCKET_LEVEL_CODES.has(name)) return false;
  if (name === "NoSuchKey" || name === "NotFound") return true;
  // `NoSuchKey` is not always typed — MinIO surfaces some misses as generic
  // errors with a 404 status. Treat a 404-shaped service error as a miss ONLY
  // after the bucket-level codes above have been excluded by name.
  return httpStatus(error) === 404;
}

/**
 * Cheap metadata read, used to answer conditional requests without ever fetching
 * the body. Returns `null` when the KEY does not exist; throws on operator errors.
 */
export async function headObject(key: string): Promise<ObjectValidators | null> {
  try {
    const out = await s3().send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return { contentLength: out.ContentLength, etag: out.ETag, lastModified: out.LastModified };
  } catch (error) {
    if (isMissingKey(error)) return null;
    throw error;
  }
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
    return {
      stream,
      contentLength: out.ContentLength,
      etag: out.ETag,
      lastModified: out.LastModified,
    };
  } catch (error) {
    if (isMissingKey(error)) return null;
    throw error;
  }
}
