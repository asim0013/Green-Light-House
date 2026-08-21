import { getObjectStream } from "@/lib/storage";
import { isValidSlug } from "@/lib/slug";
import { getDocumentBySlug } from "@/server/repositories/document";

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
 * FOUR WAYS TO 404, ONE RESPONSE: malformed slug (the gate), unknown slug,
 * `isPublic: false` (never enumerable — same null path as unknown, deliberately
 * indistinguishable), and row-exists-but-object-missing (logged server-side;
 * the client never sees storage topology or a stack trace). This is a binary
 * endpoint outside the proxy matcher — a plain 404 Response is correct, no
 * locale/chrome question arises (the 1.9 dotted-404 defer stays dormant).
 */

/** Extensions for Content-Disposition filenames, keyed by stored mime. */
const EXTENSION_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
};

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isValidSlug(slug)) return notFound();

  const document = await getDocumentBySlug(slug);
  if (!document) return notFound();

  let stored;
  try {
    stored = await getObjectStream(document.fileKey);
  } catch (error) {
    // Operator error (endpoint down, bad credentials, missing bucket). Log the
    // real cause; the client gets the same 404 as a missing object — an error
    // page that names S3 hosts is a topology leak, not a diagnostic.
    console.error(`[documents] storage error for ${slug}:`, error);
    return notFound();
  }
  if (!stored) {
    // Row exists, object gone — FR25a's "never a broken link" case. Log it: this
    // is a data-integrity problem an operator must hear about.
    console.error(`[documents] object missing for ${slug} (key ${document.fileKey})`);
    return notFound();
  }

  const extension = EXTENSION_BY_MIME[document.mime ?? ""] ?? "bin";
  const headers = new Headers({
    "Content-Type": document.mime ?? "application/octet-stream",
    // Slug-derived filename: ASCII-safe by the slug rule. Never derived from
    // translated titles, which would need RFC 5987 encoding and invite mojibake.
    "Content-Disposition": `attachment; filename="${slug}.${extension}"`,
    // Stable URL, mutable content behind it: revalidate as it's cached.
    "Cache-Control": "public, max-age=0, must-revalidate",
  });
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
