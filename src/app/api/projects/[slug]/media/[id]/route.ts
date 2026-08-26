import { getObjectStream, headObject, type ObjectValidators } from "@/lib/storage";
import { isValidSlug } from "@/lib/slug";
import { getProjectBySlug } from "@/server/repositories/project";
import { DEFAULT_LOCALE } from "@/server/i18n/resolveTranslation";

/** The ONLY storage prefix this route will serve from (Story 3.7b, AC9). */
const PROJECT_MEDIA_KEY_PREFIX = "projects/";

/**
 * `GET /api/projects/<slug>/media/<id>` — one project photograph (Story 3.1, AC10).
 *
 * THE URL WAS FROZEN BEFORE THIS ROUTE EXISTED. Story 3.0 shipped
 * `projectMediaHref` returning exactly this path, with unit tests pinning it, and
 * built no handler. So the path segments are NOT negotiable: the route fits the
 * href, never the reverse.
 *
 * Built on the `/api/documents/[slug]` precedent — the same streaming shape,
 * conditional-request short-circuit, and three-outcome error model — because that
 * route already proved all of it over the same MinIO bucket. Three DELIBERATE
 * DIVERGENCES from it, each of which would be a defect if copied verbatim:
 *
 *  1. **No `Content-Disposition: attachment`.** A datasheet is a download; a
 *     project photo is consumed by `<img>`. Sending the download header would make
 *     every image on the page prompt a save dialog instead of rendering.
 *
 *  2. **MIME AND KEY BOTH COME FROM THE PARSED ENTRY.** The documents route
 *     re-sanitises `document.mime` because that column is free text an admin can
 *     set. Here `parseProjectMedia` has already allowlisted the MIME against
 *     `SAFE_IMAGE_MIME` at the repository boundary — which is what makes the SVG
 *     rejection an actual security boundary rather than a convention. Re-deriving
 *     or re-validating it here would create a second, weaker gate; trusting the
 *     parsed entry is the point.
 *
 *  3. **No `force-static`, no `generateStaticParams`.** GET route handlers are
 *     dynamic by default in this Next version, and either addition would break the
 *     Postgres-free build.
 *
 * `/api` IS OUTSIDE THE PROXY MATCHER (`src/proxy.ts`), so this URL carries no
 * locale segment and no middleware runs on it. That is also why the alt text is
 * NOT resolved here — the response is bytes, and alt belongs to the rendering page.
 *
 * ⚠️ `robots.txt` DISALLOWS `/api`, so project photos are not crawlable. That is
 * accepted, not overlooked: they are proof for a human reader, not SEO assets, and
 * the alternative — a public bucket — would expose every other object in it.
 */

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Row exists, object gone. Logged: a media entry pointing at a missing object is a
 * data-integrity problem an operator must hear about.
 */
function objectMissing(slug: string, id: string, storageKey: string): Response {
  console.error(`[project-media] object missing for ${slug}/${id} (key ${storageKey})`);
  return notFound();
}

/**
 * Operator error (endpoint down, bad credentials, missing bucket). The client gets
 * an opaque 503 — an error naming S3 hosts is a topology leak, not a diagnostic —
 * with a `Retry-After` so crawlers hold the URL instead of dropping it. NEVER a
 * 404: that would tell a crawler the image is permanently gone.
 */
function storageUnavailable(slug: string, id: string, error: unknown): Response {
  console.error(`[project-media] storage error for ${slug}/${id}:`, error);
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
  // Second precision: HTTP dates carry no milliseconds.
  return Math.floor(lastModified.getTime() / 1000) <= Math.floor(since / 1000);
}

function cacheHeaders(validators: ObjectValidators): Headers {
  const headers = new Headers({
    // Stable URL, mutable content behind it: revalidate as it's cached.
    "Cache-Control": "public, max-age=0, must-revalidate",
  });
  if (validators.etag) headers.set("ETag", validators.etag);
  if (validators.lastModified) headers.set("Last-Modified", validators.lastModified.toUTCString());
  return headers;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string; id: string }> },
) {
  const { slug, id } = await params;
  // BOTH segments are gated before any query or cache key is built. `id` is
  // slug-shaped by the frozen contract, which is what keeps a dot-segment out of a
  // URL that `encodeURIComponent` would not have escaped.
  if (!isValidSlug(slug) || !isValidSlug(id)) return notFound();

  // Locale-independent: this response is bytes. EN keeps the cache entry shared
  // rather than minting one per locale for identical output.
  const project = await getProjectBySlug(slug, DEFAULT_LOCALE);
  if (!project) return notFound();

  // Already parsed, sorted and allowlisted at the repository boundary.
  const entry = project.media.find((candidate) => candidate.id === id);
  if (!entry) return notFound();

  // KEY-PREFIX ASSERTION (Story 3.7b, AC9). `parseProjectMedia` allowlists the
  // MIME but accepts ANY non-empty `storageKey` — so "this route cannot reach a
  // quarantined attachment" rested entirely on nobody ever writing such a key
  // into the JSONB column. `Project.media` is exactly the kind of free-form
  // blob an Epic 4 admin form will later populate. One prefix, enforced here.
  if (!entry.storageKey.startsWith(PROJECT_MEDIA_KEY_PREFIX)) {
    console.error(
      `[projects] refusing to serve ${slug}/${id}: storageKey is outside ${PROJECT_MEDIA_KEY_PREFIX}`,
    );
    return notFound();
  }

  const ifNoneMatch = request.headers.get("if-none-match");
  const ifModifiedSince = request.headers.get("if-modified-since");

  // A conditional request is answered from metadata alone — the body is never
  // fetched, which is the whole point of revalidation.
  if (ifNoneMatch || ifModifiedSince) {
    let head;
    try {
      head = await headObject(entry.storageKey);
    } catch (error) {
      return storageUnavailable(slug, id, error);
    }
    if (!head) return objectMissing(slug, id, entry.storageKey);

    const fresh = ifNoneMatch
      ? etagMatches(ifNoneMatch, head.etag)
      : notModifiedSince(ifModifiedSince!, head.lastModified);
    if (fresh) return new Response(null, { status: 304, headers: cacheHeaders(head) });
  }

  let stored;
  try {
    stored = await getObjectStream(entry.storageKey);
  } catch (error) {
    return storageUnavailable(slug, id, error);
  }
  if (!stored) return objectMissing(slug, id, entry.storageKey);

  const headers = cacheHeaders(stored);
  // Trusted because `parseProjectMedia` allowlisted it — see divergence 2 above.
  headers.set("Content-Type", entry.mime);
  if (stored.contentLength !== undefined) {
    headers.set("Content-Length", String(stored.contentLength));
  }

  return new Response(stored.stream, { status: 200, headers });
}
