import { getObjectStream, headObject, type ObjectValidators } from "@/lib/storage";
import { getMediaStorageKey } from "@/server/repositories/media";

/** The ONLY storage prefix this route will serve from (Story 4.5, AC3). */
const MEDIA_KEY_PREFIX = "media/";

/**
 * `GET /api/media/<id>` — one media-library asset (Story 4.5, AC3).
 *
 * Built on the `/api/projects/[slug]/media/[id]` precedent (itself on the
 * `/api/documents/[slug]` streaming shape): same conditional-request 304, same
 * three-outcome error model, no `Content-Disposition` (assets are consumed by
 * `<img>`/`<video>`, not downloaded), MIME taken from the persisted asset. The
 * response is bytes and carries no locale — `/api` is outside the proxy matcher.
 *
 * ⚠️ KEY-PREFIX ASSERTION. Only a `media/`-prefixed key is served; anything else
 * → 404. `media/` is disjoint from `docs/`/`projects/`/`quarantine/`, so this
 * route can never reach a document or a quarantined attachment even if some future
 * writer put a foreign key on a row.
 *
 * ⚠️ NO HTTP RANGE / 206 yet. Images need none, and NO surface embeds `<video>` in
 * Story 4.5 (the frozen `Project.media` is images-only; logo/photo are images), so
 * Range/seek support has no consumer to verify against. A full-stream 200 serves a
 * direct link and download today; Range is deferred to the first video-embedding
 * consumer (logged to deferred-work).
 */

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

function objectMissing(id: string, storageKey: string): Response {
  console.error(`[media] object missing for ${id} (key ${storageKey})`);
  return notFound();
}

function storageUnavailable(id: string, error: unknown): Response {
  console.error(`[media] storage error for ${id}:`, error);
  return new Response("Service unavailable", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "120",
      "Cache-Control": "no-store",
    },
  });
}

function normalise(etag: string): string {
  return etag.trim().replace(/^W\//, "");
}

function etagMatches(ifNoneMatch: string, etag: string | undefined): boolean {
  if (!etag) return false;
  const target = normalise(etag);
  return ifNoneMatch
    .split(",")
    .some((candidate) => candidate.trim() === "*" || normalise(candidate) === target);
}

function notModifiedSince(ifModifiedSince: string, lastModified: Date | undefined): boolean {
  if (!lastModified) return false;
  const since = Date.parse(ifModifiedSince);
  if (Number.isNaN(since)) return false;
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
}

function cacheHeaders(validators: ObjectValidators): Headers {
  const headers = new Headers({
    "Cache-Control": "public, max-age=0, must-revalidate",
  });
  if (validators.etag) headers.set("ETag", validators.etag);
  if (validators.lastModified) headers.set("Last-Modified", validators.lastModified.toUTCString());
  return headers;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Light guard before any query: an asset id is a cuid (lowercase alnum). This
  // keeps obvious junk out of the DB; a well-formed miss still 404s via lookup.
  if (!id || id.length > 64 || !/^[a-z0-9]+$/i.test(id)) return notFound();

  const asset = await getMediaStorageKey(id);
  if (!asset) return notFound();

  // Structural: only ever serve a media/-prefixed object from this route.
  if (!asset.storageKey.startsWith(MEDIA_KEY_PREFIX)) {
    console.error(`[media] refusing to serve ${id}: storageKey outside ${MEDIA_KEY_PREFIX}`);
    return notFound();
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");

  if (ifNoneMatch || ifModifiedSince) {
    let head;
    try {
      head = await headObject(asset.storageKey);
    } catch (error) {
      return storageUnavailable(id, error);
    }
    if (!head) return objectMissing(id, asset.storageKey);

    const fresh = ifNoneMatch
      ? etagMatches(ifNoneMatch, head.etag)
      : notModifiedSince(ifModifiedSince!, head.lastModified);
    if (fresh) return new Response(null, { status: 304, headers: cacheHeaders(head) });
  }

  let stored;
  try {
    stored = await getObjectStream(asset.storageKey);
  } catch (error) {
    return storageUnavailable(id, error);
  }
  if (!stored) return objectMissing(id, asset.storageKey);

  const headers = cacheHeaders(stored);
  headers.set("Content-Type", asset.mime);
  if (stored.contentLength !== undefined) {
    headers.set("Content-Length", String(stored.contentLength));
  }
  return new Response(stored.stream, { status: 200, headers });
}
