import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProjectDetail } from "@/server/repositories/project";

/**
 * The project-media handler's response contract (Story 3.1, AC10).
 *
 * The repository and storage layers are mocked: this asserts the HANDLER's
 * decisions, not Prisma's or S3's. Written up front rather than after the e2e
 * suite, because Story 2.3 proved that an e2e which gates itself on a storage
 * probe SKIPS instead of failing when the handler breaks — and a skipped keystone
 * test in the merge gate is indistinguishable from a passing one.
 */

const getProjectBySlug = vi.fn<(slug: string, locale: string) => Promise<ProjectDetail | null>>();
const getObjectStream = vi.fn();
const headObject = vi.fn();

vi.mock("@/server/repositories/project", () => ({
  getProjectBySlug: (slug: string, locale: string) => getProjectBySlug(slug, locale),
}));

vi.mock("@/lib/storage", () => ({
  getObjectStream: (key: string) => getObjectStream(key),
  headObject: (key: string) => headObject(key),
}));

const { GET } = await import("./route");

const ETAG = '"97cff40f43e2afcfe5ee626cec4de2b9"';
const LAST_MODIFIED = new Date("2026-08-21T17:20:45.000Z");

const PHOTO = {
  id: "hero",
  storageKey: "projects/lng/hero.jpg",
  mime: "image/jpeg" as const,
  alt: { en: "Gas detection skid on the jetty" },
  sort: 0,
};

function project(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    slug: "lng-terminal-fire-gas-upgrade",
    title: "LNG terminal fire & gas upgrade",
    description: null,
    outcome: null,
    isFallback: false,
    descriptionIsFallback: false,
    outcomeIsFallback: false,
    industry: null,
    deliveredAt: null,
    media: [PHOTO],
    products: [],
    ...over,
  };
}

function body(): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0xff, 0xd8, 0xff]));
      controller.close();
    },
  });
}

const call = (slug = "lng-terminal-fire-gas-upgrade", id = "hero", headers?: HeadersInit) =>
  GET(new Request("http://localhost/api/projects/x/media/y", { headers }), {
    params: Promise.resolve({ slug, id }),
  });

beforeEach(() => {
  getProjectBySlug.mockReset();
  getObjectStream.mockReset();
  headObject.mockReset();
  getProjectBySlug.mockResolvedValue(project());
  getObjectStream.mockResolvedValue({
    stream: body(),
    etag: ETAG,
    lastModified: LAST_MODIFIED,
    contentLength: 3,
  });
  headObject.mockResolvedValue({ etag: ETAG, lastModified: LAST_MODIFIED });
});

describe("GET /api/projects/[slug]/media/[id]", () => {
  it("streams the object with the PARSED entry's MIME", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    // Trusted because `parseProjectMedia` allowlisted it at the repository
    // boundary — the handler must not re-derive or re-sanitise it.
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(getObjectStream).toHaveBeenCalledWith("projects/lng/hero.jpg");
  });

  it("does NOT send Content-Disposition — these are images, not downloads", async () => {
    // Copying the documents route verbatim would make every project photo prompt
    // a save dialog instead of rendering in an <img>.
    const res = await call();
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });

  it("carries validators and a revalidating Cache-Control", async () => {
    const res = await call();
    expect(res.headers.get("ETag")).toBe(ETAG);
    expect(res.headers.get("Last-Modified")).toBe(LAST_MODIFIED.toUTCString());
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=0, must-revalidate");
  });

  it("answers a matching If-None-Match with 304 and NEVER fetches the body", async () => {
    const res = await call("lng-terminal-fire-gas-upgrade", "hero", { "if-none-match": ETAG });
    expect(res.status).toBe(304);
    // The whole point of revalidation: metadata only.
    expect(getObjectStream).not.toHaveBeenCalled();
    expect(headObject).toHaveBeenCalledWith("projects/lng/hero.jpg");
  });

  it("answers a fresh If-Modified-Since with 304", async () => {
    const res = await call("lng-terminal-fire-gas-upgrade", "hero", {
      "if-modified-since": new Date(LAST_MODIFIED.getTime() + 60_000).toUTCString(),
    });
    expect(res.status).toBe(304);
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it("streams normally when the validator does not match", async () => {
    const res = await call("lng-terminal-fire-gas-upgrade", "hero", {
      "if-none-match": '"stale"',
    });
    expect(res.status).toBe(200);
    expect(getObjectStream).toHaveBeenCalled();
  });

  it("answers a storage OUTAGE with 503 and Retry-After, NEVER 404", async () => {
    // A 404 would tell a crawler the image is permanently gone. This is the exact
    // defect the Story 2.3 review found in the documents route.
    getObjectStream.mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await call();
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("120");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("does not leak the storage endpoint or key in the 503 body", async () => {
    getObjectStream.mockRejectedValue(new Error("connect ECONNREFUSED http://minio:9000"));
    const res = await call();
    const text = await res.text();
    expect(text).not.toContain("minio");
    expect(text).not.toContain("projects/lng/hero.jpg");
  });

  it("404s when the object is gone but the entry still names it", async () => {
    getObjectStream.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("404s for an unknown or unpublished project", async () => {
    getProjectBySlug.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it("404s for a media id the project does not carry", async () => {
    expect((await call("lng-terminal-fire-gas-upgrade", "no-such-id")).status).toBe(404);
    expect(getObjectStream).not.toHaveBeenCalled();
  });

  it.each([
    ["a malformed project slug", "Not A Slug", "hero"],
    ["a dot-segment id", "lng-terminal-fire-gas-upgrade", ".."],
    ["a slashed id", "lng-terminal-fire-gas-upgrade", "a/b"],
    ["an uppercase id", "lng-terminal-fire-gas-upgrade", "Hero"],
  ])("404s on %s before any query runs", async (_label, slug, id) => {
    const res = await call(slug, id);
    expect(res.status).toBe(404);
    // The gate runs BEFORE the repository, so no cache entry is minted for junk.
    expect(getProjectBySlug).not.toHaveBeenCalled();
  });

  it("reads the project locale-independently — bytes do not vary by language", async () => {
    await call();
    expect(getProjectBySlug).toHaveBeenCalledWith("lng-terminal-fire-gas-upgrade", "en");
  });
});
