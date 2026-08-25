import { isValidSlug } from "@/lib/slug";

/**
 * THE FROZEN EPIC 3 CONTRACTS (Story 3.0).
 *
 * This module exists because every Epic 3 story either freezes a cross-story
 * contract or needs one that does not exist yet — and the project has already
 * been bitten once by a contract minted unilaterally mid-epic: Story 2.5 shipped
 * `/rfq?q=` and pinned it in two e2e assertions before Story 3.4, which nominally
 * owns pre-fill, had any say. Freezing these here is what stops that recurring.
 *
 * Nothing in this file renders. Story 3.2 builds the form against it, 3.4 the
 * doorways, 3.7b the attachment states, and 4.7 the admin list. If you find
 * yourself wanting to change a shape here, that is a cross-story decision — take
 * it deliberately rather than in the story that happens to notice.
 */

// ---------------------------------------------------------------------------
// 1. The pre-fill URL vocabulary
// ---------------------------------------------------------------------------

/**
 * The five params `/rfq` accepts, and NOTHING else.
 *
 * SLUGS, NEVER IDS. Story 2.4 proved live that an id-keyed lookup behind a
 * slug-keyed surface silently poisons renames — a cached null under an id key
 * made a publish a success-reporting no-op. Every shipped catalog param in this
 * repo (`?category=`, `?manufacturer=`, `?series=`) is slug-shaped, and the RFQ
 * doorways match them.
 *
 * NEVER A HUMAN-READABLE LABEL. A label in a URL is untranslatable, unverifiable
 * and spoofable: the banner text must be resolved server-side from the slug so it
 * is localized and carries the FR34a fallback marking like every other rendered
 * name.
 *
 * SINGLE-VALUED, FIRST-WINS. Repeatable params are explicitly REJECTED — not
 * merely unimplemented — so Story 3.4 does not reopen it. `?product=a&product=b`
 * takes `a` and ignores `b`, exactly as `catalogParam` already does for the
 * catalog. A multi-item inquiry is built by editing the form, not by URL.
 */
export const PREFILL_PARAMS = ["project", "product", "industry", "category", "q"] as const;

export type PrefillParam = (typeof PREFILL_PARAMS)[number];

/**
 * Which params are slug-gated. `q` is the exception and is deliberately NOT:
 * it is free buyer text (a pasted model number), already shipped by Story 2.5's
 * zero-result state, and already sanitized by `searchQueryOf` in
 * `@/server/catalog-page` — control-character stripping and an 80-code-point cap.
 * Reuse that; do not write a second sanitizer.
 */
export const SLUG_PREFILL_PARAMS = ["project", "product", "industry", "category"] as const;

/**
 * Resolution precedence when several params arrive together.
 *
 * The most specific context wins for `Lead.source`, because that is what the
 * admin needs to know: a lead that came from a product page is a product lead
 * even if the URL also carried its industry. All *values* are still preserved in
 * `prefillContext`; precedence decides `source` only.
 */
export const PREFILL_PRECEDENCE = ["project", "product", "industry", "q"] as const;

/**
 * Read one slug-shaped pre-fill param. Returns null for absent, malformed,
 * over-long or repeated-but-invalid values — the caller renders the RFQ with no
 * pre-fill rather than erroring, because a mistyped doorway URL must never cost
 * the buyer their inquiry.
 *
 * An unknown-but-well-formed slug also returns its value: whether it resolves to
 * a real row is the caller's lookup, not this gate's business.
 */
export function prefillSlugOf(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first) return null;
  return isValidSlug(first) ? first : null;
}

// ---------------------------------------------------------------------------
// 2. Lead.industry
// ---------------------------------------------------------------------------

/**
 * `Lead.industry` stores the industry SLUG, resolved server-side.
 *
 * THE DECISIVE ARGUMENT IS THE MISSING FK, NOT TRANSLATION. `Lead` deliberately
 * has no relation to `Industry`: a lead is a historical record and must survive
 * its industry being renamed, re-slugged or deleted. That rules out an id. It
 * also rules out a translated label, which would make Story 4.7's filter depend
 * on the locale the buyer happened to be using. The slug is the only value that
 * is stable, joinable and locale-independent.
 *
 * Store null when the doorway carried no industry. Never store a display name.
 */
export type LeadIndustrySlug = string | null;

// ---------------------------------------------------------------------------
// 3. Lead.equipment
// ---------------------------------------------------------------------------

/**
 * `Lead.equipment` is a TAGGED UNION ARRAY.
 *
 * THE DISCRIMINATOR IS AN EXPLICIT `kind`, NEVER THE PRESENCE OF A FIELD.
 * Presence-based discrimination ("it has a slug, so it must be a catalog item")
 * degrades silently: the moment a free-typed entry gains an optional field for
 * any reason, every consumer's branch flips. Story 4.7's admin has to show a
 * resolved PID reference differently from something the buyer typed — a link
 * versus plain text — and it must be able to tell them apart without guessing.
 */
export type LeadEquipmentItem =
  | {
      /** Resolved against the PID at submit time. */
      kind: "product";
      /** Product slug — stable across renames, unlike the id (Story 2.4). */
      slug: string;
      /** Snapshot of the display name AT SUBMIT TIME, for the admin and the emails. */
      label: string;
    }
  | {
      kind: "category";
      slug: string;
      label: string;
    }
  | {
      /** The buyer typed something the catalog does not contain. This is a
       *  first-class case, not an error: GLH supplies well beyond what is
       *  listed, which is the whole premise of the RFQ. */
      kind: "freeText";
      /** Exactly what the buyer typed, sanitized but never "corrected". */
      text: string;
    };

export type LeadEquipment = LeadEquipmentItem[];

/**
 * Runtime guard for reading `Lead.equipment` back out of JSONB.
 *
 * Prisma types the column `Json`, so anything that has ever been written is
 * possible — including rows written by a future admin, an import, or by hand.
 * Consumers must narrow rather than cast.
 */
export function isLeadEquipmentItem(value: unknown): value is LeadEquipmentItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  if (item.kind === "product" || item.kind === "category") {
    return typeof item.slug === "string" && typeof item.label === "string";
  }
  if (item.kind === "freeText") return typeof item.text === "string";
  return false;
}

/** Narrow a raw JSONB value, dropping anything that does not match the contract. */
export function parseLeadEquipment(value: unknown): LeadEquipment {
  if (!Array.isArray(value)) return [];
  return value.filter(isLeadEquipmentItem);
}
