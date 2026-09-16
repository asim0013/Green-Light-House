import type { z } from "zod";
import { requireAdmin, AuthRequiredError } from "@/lib/auth/guard";
import { revalidateTags } from "@/lib/revalidate";
import { issueDetails } from "@/server/rfq/schema";

/**
 * The one wrapper every admin catalog mutation runs through (Story 4.3):
 *
 *   requireAdmin()  →  zod safeParse  →  body()  →  revalidateTags()
 *
 * It centralises the four things every create/update/delete must do, so each
 * entity's action is thin and none can forget the guard or the cache purge:
 *
 * - AUTH. `requireAdmin()` — the `(authed)` layout only guards page RENDER; a
 *   Server Action is separately reachable and MUST re-check (guard.ts:4-10,
 *   architecture:137). An expired session returns a mapped `unauthorized`
 *   result the form can surface, never a raw throw.
 * - VALIDATION. Server-authoritative `safeParse`; failures become the standard
 *   `{ error: { code, message, details } }` envelope with `issueDetails`
 *   (`{ path, key }[]`) so the client maps keys onto fields exactly like RFQ.
 * - REVALIDATION. The body returns the tag set to bust; the wrapper calls
 *   `revalidateTags` in-process AFTER the write commits — never before.
 * - DOMAIN FAILURES. A body throws {@link MutationError} for a foreseeable
 *   conflict (slug taken, entity still referenced) and it becomes a clean mapped
 *   result instead of a 500.
 */

export type MutationDetail = { path: string; key: string };

export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: MutationDetail[] } };

/** A foreseeable domain failure a mutation body throws to become a mapped result. */
export class MutationError extends Error {
  readonly code: string;
  readonly details?: MutationDetail[];
  constructor(code: string, message: string, details?: MutationDetail[]) {
    super(message);
    this.name = "MutationError";
    this.code = code;
    this.details = details;
  }
}

export async function withAdminMutation<Input, Output>(
  schema: z.ZodType<Input>,
  raw: unknown,
  body: (input: Input) => Promise<{ tags: readonly string[]; data: Output }>,
): Promise<MutationResult<Output>> {
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return {
        ok: false,
        error: { code: "unauthorized", message: "Your session has expired. Please sign in again." },
      };
    }
    throw err;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "Please fix the highlighted fields.",
        details: issueDetails(parsed.error),
      },
    };
  }

  try {
    const { tags, data } = await body(parsed.data);
    revalidateTags(tags);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof MutationError) {
      return { ok: false, error: { code: err.code, message: err.message, details: err.details } };
    }
    throw err;
  }
}
