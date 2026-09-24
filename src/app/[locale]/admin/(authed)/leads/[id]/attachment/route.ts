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
  // Filename from the buyer's original name; quote-escape to keep the header valid.
  const safeName = attachment.name.replace(/["\\]/g, "_");
  headers.set("Content-Disposition", `attachment; filename="${safeName}"`);
  if (stored.contentLength !== undefined) {
    headers.set("Content-Length", String(stored.contentLength));
  }
  return new Response(stored.stream, { status: 200, headers });
}
