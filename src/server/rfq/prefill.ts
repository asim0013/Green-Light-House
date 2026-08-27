import type { LeadSource } from "@prisma/client";
import { searchQueryOf } from "@/server/catalog-page";
import {
  PREFILL_PRECEDENCE,
  SLUG_PREFILL_PARAMS,
  prefillSlugOf,
  type PrefillContext,
  type SlugPrefillParam,
} from "./contracts";
import { isStorableText } from "./schema";

/**
 * The doorway resolver (Story 3.4 — FR15/FR22/FR28/FR17a-doorway).
 *
 * PURE. No Prisma, no fetch, no env. Everything here is a decision that can be
 * wrong without a database, which is exactly what makes it testable — and Story
 * 3.3's review found an AC-mandated proof that was IMPOSSIBLE because the code
 * lived where the runner could not see it. `vitest.config.mts` includes `src/**`
 * only; this file is inside it on purpose.
 *
 * WHAT THIS MODULE DOES NOT DO: resolve slugs to rows. That is the caller's
 * lookup, deliberately — `prefillSlugOf`'s own contract says an
 * unknown-but-well-formed slug is a legal value and "whether it resolves to a
 * real row is the caller's lookup, not this gate's business".
 */

/** The raw shape Next hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Gated params: slug-shaped ones that passed `isValidSlug`, plus a sanitized `q`. */
export type PrefillParams = Partial<Record<SlugPrefillParam, string>> & { q?: string };

/**
 * Apply the shipped gates to a raw query string. NEVER THROWS.
 *
 * ⚠️ NO THIRD SANITIZER. `contracts.ts` orders reuse of `prefillSlugOf` for the
 * four slug params and `searchQueryOf` for `q`, and both are shipped. What is
 * genuinely NEW here is COMPOSING a second gate onto `q`:
 *
 * `searchQueryOf` strips C0/C1 control characters and caps by code point, but it
 * PASSES bidi overrides — while `./schema.ts`'s `isStorableText`, the RFQ's own
 * write boundary, REJECTS them with a 422. Without this composition the site
 * would pre-fill the project-description field with a value it then refuses to
 * accept, and would scramble the text direction of a localized banner on the way.
 * That is a defect of the doorway, not of either gate.
 */
export function readPrefillParams(raw: RawSearchParams): PrefillParams {
  const params: PrefillParams = {};

  for (const param of SLUG_PREFILL_PARAMS) {
    const slug = prefillSlugOf(raw[param]);
    if (slug) params[param] = slug;
  }

  const query = searchQueryOf(raw.q);
  // `isStorableText` is applied to the SANITIZED value, not the raw one: the
  // cleaning step can only remove hostile code points, never introduce them, so
  // gating afterwards is the strictly safer order.
  if (query && isStorableText(query)) params.q = query;

  return params;
}

/**
 * Which doorway this lead came through (`Lead.source`).
 *
 * Walks the FROZEN `PREFILL_PRECEDENCE` and takes the first present param. The
 * mapping is not invented here — `contracts.ts:73-78` writes it down verbatim so
 * it is not inferred: `project`/`product`/`industry` map to their same-named
 * values, `q` maps to `search`, and absent-or-only-`category` maps to `direct`.
 *
 * ⚠️ `category` IS NOT IN THE PRECEDENCE LIST, and that is deliberate rather than
 * an oversight — it was mis-filed as a defect in the Story 3.0 review. A category
 * doorway is EQUIPMENT context, not an origin: it rides in `Lead.equipment` as a
 * `{ kind: "category" }` item and is preserved verbatim in `prefillContext`, so
 * such a lead is still fully distinguishable from cold traffic. `LeadSource` has
 * no `category` member to write.
 *
 * `LeadSource.service` is RESERVED and unreachable: the services-page CTA ships
 * context-free, so no param in the frozen vocabulary transmits it. Story 3.4
 * took that decision explicitly and declined to add one.
 */
export function resolvePrefillSource(params: PrefillParams): LeadSource {
  for (const param of PREFILL_PRECEDENCE) {
    if (!params[param]) continue;
    return param === "q" ? "search" : (param as LeadSource);
  }
  return "direct";
}

/** What the buyer did with what the doorway gave them. */
export interface PrefillDisposition {
  cleared: boolean;
  edited: boolean;
}

/**
 * Assemble the `Lead.prefillContext` value.
 *
 * SLUGS ONLY in `resolved` — every value here has already passed `isValidSlug`
 * via `readPrefillParams`, and `parsePrefillContext` re-gates on the way back out
 * of JSONB. `q` is kept separately because it is buyer text, not a slug.
 */
export function buildPrefillContext(
  params: PrefillParams,
  disposition: PrefillDisposition,
): PrefillContext {
  const resolved: Partial<Record<SlugPrefillParam, string>> = {};
  for (const param of SLUG_PREFILL_PARAMS) {
    const slug = params[param];
    if (slug) resolved[param] = slug;
  }

  const context: PrefillContext = {
    resolved,
    cleared: disposition.cleared,
    edited: disposition.edited,
  };
  if (params.q) context.query = params.q;
  return context;
}
