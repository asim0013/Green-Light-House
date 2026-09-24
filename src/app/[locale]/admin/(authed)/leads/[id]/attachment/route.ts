import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { getObjectStream } from "@/lib/storage";
import { getServableLeadAttachment } from "@/server/repositories/lead";

/**
 * `GET /[locale]/admin/leads/<id>/attachment` — the RFQ attachment download
 * (Story 4.7, AC4). The FIRST reader of the `quarantine/` prefix, and it is
 * NEVER public:
 *  - `requireAdmin()` → 401 (defence-in-depth; the proxy also gates /[locale]/admin).
 *  - `getServableLeadAttachment` returns a key ONLY when `attachmentScanStatus`
 *    is `"clean"` and a key is present — the same clean-branch logic
 *    `toLeadAttachmentView` uses for the link. A pending/infected/failed/absent
 *    attachment → 404 (never served, never distinguished).
 *  - The key MUST start with `quarantine/` (asserted) — a defensive echo of the
 *    sibling public routes' prefix assertions, from the opposite side: this route
 *    serves ONLY quarantine, they serve everything BUT.
 *
 * `Content-Disposition: attachment` (a lead attachment is a download, unlike a
 * project photo). The frozen `leadAttachmentHref` names this URL; the storage key
 * never reaches the browser.
 */
const QUARANTINE_PREFIX = "quarantine/";

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Build a safe `Content-Disposition` from the buyer's ORIGINAL filename.
 *
 * ⚠️ `attachmentName` is attacker-controlled and `isStorableText` DELIBERATELY
 * permits CR/LF/tab (it also guards free-text fields). Interpolating it raw would
 * (a) let CR/LF split the header and (b) throw in the Fetch `Headers` validator —
 * an unhandled 500 on every download of that lead. So: an ASCII-only `filename`
 * fallback (control chars, DEL, non-ASCII, quotes and backslashes filtered out by
 * char code — no `\xNN` escapes in source, which the editor would turn into raw
 * bytes) PLUS an RFC 5987 `filename*` that percent-encodes the full UTF-8 name for
 * clients that read it (so Türkçe/Cyrillic names survive).
 */
function contentDisposition(name: string): string {
  const ascii =
    [...name]
      .filter((ch) => {
        const code = ch.charCodeAt(0);
        return code > 0x1f && code < 0x7f && ch !== '"' && ch !== "\\";
      })
      .join("") || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      return new Response("Unauthorized", {
        status: 401,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    throw error;
  }

  const { id } = await params;
  const attachment = await getServableLeadAttachment(id);
  if (!attachment) return notFound(); // absent / not clean / no key — all indistinguishable

  // Structural guarantee: this route serves ONLY quarantine objects.
  if (!attachment.storageKey.startsWith(QUARANTINE_PREFIX)) {
    console.error(`[leads] refusing to serve ${id}: key outside ${QUARANTINE_PREFIX}`);
    return notFound();
  }

  let stored;
  try {
    stored = await getObjectStream(attachment.storageKey);
  } catch (error) {
    console.error(`[leads] storage error for ${id}:`, error);
    return new Response("Service unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "120" },
    });
  }
  if (!stored) return notFound(); // row references a gone object

  const headers = new Headers({ "Cache-Control": "no-store" });
  headers.set("Content-Type", attachment.mime ?? "application/octet-stream");
  headers.set("Content-Disposition", contentDisposition(attachment.name));
  if (stored.contentLength !== undefined) {
    headers.set("Content-Length", String(stored.contentLength));
  }
  return new Response(stored.stream, { status: 200, headers });
}
