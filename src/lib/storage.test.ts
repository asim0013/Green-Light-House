import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The storage error contract (Story 2.3, hardened in its review).
 *
 * THE DISTINCTION UNDER TEST: a missing OBJECT is `null` (the caller's 404); a
 * missing BUCKET, bad credentials or a dead endpoint THROWS (the caller's 503).
 * The original catch treated any 404-shaped error as a miss — and NoSuchBucket
 * is a 404 — so the single most likely operator error was reported to operators
 * as a per-document data-integrity problem while every download silently 404'd.
 *
 * These are unit tests over the classification only; the live MinIO behaviour
 * they encode was measured in the review (NoSuchBucket: name "NoSuchBucket",
 * $metadata.httpStatusCode 404).
 */

const send = vi.fn();

class MockNoSuchKey extends Error {
  readonly $metadata = { httpStatusCode: 404 };
  constructor() {
    super("NoSuchKey");
    this.name = "NoSuchKey";
  }
}

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send = send;
    destroy = vi.fn();
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  HeadObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
  NoSuchKey: MockNoSuchKey,
}));

/** A service error shaped the way the SDK shapes them. */
function serviceError(name: string, httpStatusCode: number): Error {
  const error = new Error(name) as Error & { $metadata: { httpStatusCode: number } };
  error.name = name;
  error.$metadata = { httpStatusCode };
  return error;
}

const { getObjectStream, headObject } = await import("./storage");

beforeEach(() => {
  send.mockReset();
});

describe("getObjectStream error classification", () => {
  it("returns null for a missing KEY — the caller's 404", async () => {
    send.mockRejectedValue(new MockNoSuchKey());
    await expect(getObjectStream("docs/gone.pdf")).resolves.toBeNull();
  });

  it("returns null for a generic 404-shaped miss (MinIO does this)", async () => {
    send.mockRejectedValue(serviceError("NotFound", 404));
    await expect(getObjectStream("docs/gone.pdf")).resolves.toBeNull();
  });

  it("THROWS for a missing BUCKET even though it is a 404", async () => {
    // The regression this test exists for: NoSuchBucket took the miss branch,
    // so a typo'd S3_BUCKET reported "object missing" for every document.
    send.mockRejectedValue(serviceError("NoSuchBucket", 404));
    await expect(getObjectStream("docs/fd-9500-datasheet-v1.pdf")).rejects.toThrow("NoSuchBucket");
  });

  it("THROWS for AccessDenied — credentials are an operator error, not a miss", async () => {
    send.mockRejectedValue(serviceError("AccessDenied", 403));
    await expect(getObjectStream("docs/x.pdf")).rejects.toThrow("AccessDenied");
  });

  it("THROWS for an unreachable endpoint (no $metadata at all)", async () => {
    send.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:9000"));
    await expect(getObjectStream("docs/x.pdf")).rejects.toThrow("ECONNREFUSED");
  });

  it("carries the validators a cache needs off the S3 response", async () => {
    const lastModified = new Date("2026-08-21T17:20:45.000Z");
    send.mockResolvedValue({
      Body: { transformToWebStream: () => new ReadableStream() },
      ContentLength: 602,
      ETag: '"97cff40f43e2afcfe5ee626cec4de2b9"',
      LastModified: lastModified,
    });

    const stored = await getObjectStream("docs/fd-9500-datasheet-v1.pdf");
    expect(stored?.contentLength).toBe(602);
    expect(stored?.etag).toBe('"97cff40f43e2afcfe5ee626cec4de2b9"');
    expect(stored?.lastModified).toEqual(lastModified);
  });
});

describe("headObject", () => {
  it("returns validators without a body", async () => {
    send.mockResolvedValue({ ContentLength: 610, ETag: '"abc"', LastModified: new Date(0) });
    await expect(headObject("docs/fd-9500-en54-v1.pdf")).resolves.toMatchObject({
      contentLength: 610,
      etag: '"abc"',
    });
  });

  it("applies the same bucket-vs-key rule as getObjectStream", async () => {
    send.mockRejectedValue(serviceError("NoSuchBucket", 404));
    await expect(headObject("docs/x.pdf")).rejects.toThrow("NoSuchBucket");

    send.mockRejectedValue(serviceError("NotFound", 404));
    await expect(headObject("docs/x.pdf")).resolves.toBeNull();
  });
});
