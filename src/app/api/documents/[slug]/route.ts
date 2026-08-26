import { getObjectStream, headObject, type ObjectValidators } from "@/lib/storage";
import { isValidSlug } from "@/lib/slug";
import { getDocumentBySlug } from "@/server/repositories/document";

/** The ONLY storage prefix this route will serve from (Story 3.7b, AC9). */
const DOCUMENT_KEY_PREFIX = "docs/";

/**
 * `GET /api/documents/<slug>` — the ungated, versioned document download
 * (Story 2.3; FR24/FR25/FR25a; architecture:171 binds this exact placement).
 *
 * UNGATED IS THE POINT: no auth, no form, no interstitial — the response IS the
 * file. EXPERIENCE.md calls this "a trust commitment, not a lead-capture
 * opportunity", and CM3 makes it a guarded counter-metric: staying ungated is
 * deliberate even at the cost of email captures.
 *
 * STABLE URLS (FR25a): the public identity is the SLUG; the served bytes are
 * whatever `fileKey` currently points at. Replacing a document is an admin-side
 * `fileKey` update — this URL never changes. Measured in the integration suite:
 * swap `fileKey`, same URL serves the new object.
 *
 * STREAMED, not redirected (Task 0 spike, measured): the S3 body pipes through as
 * a web stream, so the storage host (`localhost:9000` in dev, whatever R2/MinIO
 * host in prod) never appears in any response. FR25a's "404/redirect" wording
 * covers REMOVED documents, not the happy path.
 *
 * CACHING: GET route handlers are DYNAMIC BY DEFAULT in this Next version
 * (bundled route.md:669 — changed from static in v15), so this executes per
 * request and NEVER at build; `export const dynamic = "force-static"` is the
 * opt-in that would break the DB-free build rule and is forbidden here. The
 * metadata-route special case (`sitemap.ts`) does not apply to plain handlers.
 *
 * REVALIDATION IS NOW POSSIBLE (2.3 review). The response advertises
 * `must-revalidate` but used to ship NO validator and ignore conditional
 * requests, so no cache could ever revalidate — measured: a future-dated
 * `If-Modified-Since` still returned a full 200. ETag and Last-Modified now
 * travel from the S3 response, and a conditional request is answered from a
 * cheap HeadObject — the body is never fetched to serve a 304.
 *
 * THREE OUTCOMES, DELIBERATELY DISTINCT (2.3 review):
 *   404 — malformed slug, unknown slug, `isPublic: false`, or row-exists-but-
 *         object-gone. Unknown and private are ONE null path, deliberately
 *         indistinguishable, so a prober cannot enumerate private documents.
 *   503 — the storage backend itself is unreachable/misconfigured. Measured
 *         before this change: `docker stop` on MinIO made every LIVE document
 *         answer 404 "Not found", which tells a crawler the file is GONE and
 *         hands a visitor exactly the broken link FR25a forbids. A 503 with the
 *         same opaque body leaks no topology and asks for a retry instead.
 *         (No enumeration leak: only rows that are already PUBLIC ever reach
 *         storage, so 503-vs-404 distinguishes nothing that isn't public.)
 *   200 — the bytes.
 */

/** Extensions for Content-Disposition filenames, keyed by stored mime. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
};

/**
 * A conservative RFC 7231 media type: `type/subtype` plus optional parameters,
 * built only from characters legal in a header value.
 *
 * WHY VALIDATE A DB COLUMN (2.3 review): `mime` is a nullable, unconstrained
 * column, and `new Headers()` THROWS on a value carrying CR/LF or other illegal
 * bytes. Header construction sits outside the storage try/catch, so one bad row
 * — from a future admin UI or a hand-written UPDATE — produced a 500 with a
 * stack instead of any documented outcome. Measured: a mime of "application/\npdf"
 * returned 500 with `TypeError: Headers.append: … is an invalid header value`
 * and no `[documents]` log line at all. Anything unrecognised now degrades to
 * the octet-stream default rather than crashing the route.
 */
const MEDIA_TYPE =
  /^[\w!#$%&'*+.^`|~-]+\/[\w!#$%&'*+.^`|~-]+(?:\s*;\s*[\w!#$%&'*+.^`|~-]+=[\w!#$%&'*+.^`|~-]+)*$/;

function safeMime(mime: string | null): string | null {
  if (!mime || mime.length > 255) return null;
  return MEDIA_TYPE.test(mime) ? mime : null;
}

/**
 * The download filename's extension.
 *
 * PREFER THE STORED KEY (2.3 review). The mime map knows only PDF, so anything
 * else saved as `<slug>.bin` — and with `Content-Disposition: attachment` the
 * FILENAME governs what lands on disk, so a perfectly valid file arrived with an
 * extension Windows cannot open. Measured: a DOCX row downloaded as
 * `zz-docx-doc.bin`, and a NULL-mime row served real `%PDF-` bytes named `.bin`.
 * `fileKey` already carries the true extension, so read it there first and keep
 * the mime map (then `bin`) as the fallback chain.
 */
function extensionFor(fileKey: string, mime: string | null): string {
  const fromKey = /\.([a-z0-9]{1,8})$/i.exec(fileKey.split("/").pop() ?? "");
  if (fromKey) return fromKey[1].toLowerCase();
  return EXTENSION_BY_MIME[mime ?? ""] ?? "bin";
}

/** RFC 9110 weak-comparison-safe ETag match, including the `*` wildcard. */
function etagMatches(ifNoneMatch: string, etag: string | undefined): boolean {
  if (!etag) return false;
  const normalise = (tag: string) => tag.trim().replace(/^W\//, "");
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

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return notFound();

  const document = await getDocumentBySlug(slug);
  if (!document) return notFound();

  // KEY-PREFIX ASSERTION (Story 3.7b, AC9). Until now "no route can serve a
  // quarantined attachment" was true only CIRCUMSTANTIALLY — because no
  // `Document.fileKey` happens to point outside `docs/`. This makes it
  // structural: whatever a row (or a future admin form, or a bad migration)
  // puts in `fileKey`, this handler serves objects from ONE prefix and nothing
  // else. Three lines, and it turns an accident into a guarantee.
  if (!document.fileKey.startsWith(DOCUMENT_KEY_PREFIX)) {
    console.error(
      `[documents] refusing to serve ${slug}: fileKey is outside ${DOCUMENT_KEY_PREFIX}`,
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
      head = await headObject(document.fileKey);
    } catch (error) {
      return storageUnavailable(slug, error);
    }
    if (!head) return objectMissing(slug, document.fileKey);

    const fresh = ifNoneMatch
      ? etagMatches(ifNoneMatch, head.etag)
      : notModifiedSince(ifModifiedSince!, head.lastModified);
    if (fresh) return new Response(null, { status: 304, headers: cacheHeaders(head) });
  }

  let stored;
  try {
    stored = await getObjectStream(document.fileKey);
  } catch (error) {
    return storageUnavailable(slug, error);
  }
  if (!stored) return objectMissing(slug, document.fileKey);

  const mime = safeMime(document.mime);
  const extension = extensionFor(document.fileKey, mime);
  const headers = cacheHeaders(stored);
  headers.set("Content-Type", mime ?? "application/octet-stream");
  // Slug-derived filename: ASCII-safe by the slug rule. Never derived from
  // translated titles, which would need RFC 5987 encoding and invite mojibake.
  headers.set("Content-Disposition", `attachment; filename="${slug}.${extension}"`);
  if (stored.contentLength !== undefined) {
    headers.set("Content-Length", String(stored.contentLength));
  }

  return new Response(stored.stream, { status: 200, headers });
}

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Row exists, object gone — FR25a's "never a broken link" case. Log it: this is
 * a data-integrity problem an operator must hear about.
 */
function objectMissing(slug: string, fileKey: string): Response {
  console.error(`[documents] object missing for ${slug} (key ${fileKey})`);
  return notFound();
}

/**
 * Operator error (endpoint down, bad credentials, missing bucket). Log the real
 * cause; the client gets an opaque 503 — an error page that names S3 hosts is a
 * topology leak, not a diagnostic — and a `Retry-After` so crawlers hold the URL
 * instead of dropping it from the index.
 */
function storageUnavailable(slug: string, error: unknown): Response {
  console.error(`[documents] storage error for ${slug}:`, error);
  return new Response("Service unavailable", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Retry-After": "120",
      "Cache-Control": "no-store",
    },
  });
}
