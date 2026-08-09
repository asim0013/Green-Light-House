import { createHash, timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { isKnownTag } from "@/lib/cache-tags";

/**
 * On-demand cache revalidation (Story 1.8, FR40).
 *
 * This is the seam Epic 4's admin mutations will call after a create/update/delete
 * so the public site reflects the change without a redeploy. Nothing user-facing
 * calls it; in v1 it is driven by the shared secret alone.
 *
 * `POST /api/revalidate`
 *   header: `x-revalidate-secret: <REVALIDATE_SECRET>`
 *   body:   `{ "tags": ["projects", "industry:oil-gas"] }`
 */

const BodySchema = z.object({
  // Bounded: an unbounded array would let one call fan out into thousands of
  // Redis writes.
  tags: z.array(z.string().min(1)).min(1).max(50),
});

/** Architecture § Format — errors are `{ error: { code, message, details? } }`. */
function fail(status: number, code: string, message: string, details?: unknown) {
  return Response.json({ error: { code, message, details } }, { status });
}

/**
 * Compare via fixed-length digests so the comparison time cannot leak the secret's
 * length or contents (`timingSafeEqual` throws on unequal-length buffers, so the
 * naive form is both unsafe and fragile).
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET;

  // FAIL CLOSED. An unset secret must never mean "no authentication required" —
  // that would leave a public cache-purge endpoint open on every deployment that
  // forgot to configure it.
  if (!expected) {
    return fail(503, "not_configured", "Revalidation is not configured.");
  }

  const provided = request.headers.get("x-revalidate-secret") ?? "";
  if (!secretMatches(provided, expected)) {
    return fail(401, "unauthorized", "Invalid or missing revalidation secret.");
  }

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    // zod validation → 422 with field-level errors (architecture § Format).
    return fail(422, "invalid_body", "Request body failed validation.", {
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }

  // Only tags this app actually issues. Without this the endpoint would forward
  // arbitrary strings into the cache layer.
  const unknown = parsed.data.tags.filter((tag) => !isKnownTag(tag));
  if (unknown.length > 0) {
    return fail(422, "unknown_tag", "One or more tags are not recognised.", { unknown });
  }

  // Next 16.2 requires a cache profile as the second argument (it is typed
  // `string | CacheLifeConfig`, not optional).
  //
  // Be precise about what `"max"` means, because the obvious reading is wrong: to a
  // Next-NATIVE handler it marks entries stale immediately and hard-expiring only
  // much later — i.e. stale-while-revalidate, not a purge. This app gets a true
  // immediate purge because `cache-handler.js` ignores the profile entirely and
  // simply stamps the tag, which makes every entry carrying it miss on the next
  // read. That is the behaviour an admin publish needs; it is a property of OUR
  // handler, not of the profile name.
  for (const tag of parsed.data.tags) {
    revalidateTag(tag, "max");
  }

  return Response.json({ revalidated: parsed.data.tags, at: new Date().toISOString() });
}
