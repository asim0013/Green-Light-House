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
 * Nothing in this file renders. Story 3.2 BUILT the form and endpoint against
 * it (`./schema.ts` is the runtime half); 3.4 builds the doorways, 3.7b the
 * attachment states, and 4.7 the admin list. If you find
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
 * takes `a` and ignores `b`, matching the three shipped catalog readers —
 * `categoryParamOf`, `filterSlugOf` and `searchQueryOf` in
 * `@/server/catalog-page`. A multi-item inquiry is built by editing the form,
 * not by URL.
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
 *
 * ⚠️ `category` IS ABSENT FROM THIS LIST ON PURPOSE — it is not an oversight, and
 * the omission was mis-filed as a defect in the Story 3.0 code review precisely
 * because nothing said so here. A category doorway is EQUIPMENT context, not an
 * origin: it is carried by `LeadEquipmentItem { kind: "category" }` below and
 * preserved verbatim in `prefillContext`, so such a lead remains fully
 * distinguishable from cold traffic and can be back-filled to a `source` value
 * later if one is ever wanted. `LeadSource` deliberately has no `category` member.
 *
 * The param→`LeadSource` mapping, written down so it is not inferred: `project`,
 * `product` and `industry` map to their same-named values; `q` maps to `search`;
 * absent-or-only-`category` maps to `direct`. `LeadSource.service` is a RESERVED
 * origin — the services-page CTA ships context-free (`services/page.tsx` links a
 * bare `SITE.rfqHref`), so no param in the frozen vocabulary transmits it today.
 * Story 3.4 decides whether one does; until then nothing can write it.
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
      /** Exactly what the buyer typed — never "corrected". What "sanitized"
       *  means here, precisely (3.2 review — an earlier draft claimed
       *  sanitization that did not exist): the write boundary
       *  (`./schema.ts`) REJECTS hostile code points (NUL/C0, bidi
       *  overrides, lone surrogates) with a 422 rather than stripping them;
       *  text that stores is stored verbatim. */
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
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

export function isLeadEquipmentItem(value: unknown): value is LeadEquipmentItem {
  if (typeof value !== "object" || value === null) return false;
  if (Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (item.kind === "product" || item.kind === "category") {
    // `slug` is SLUG-GATED, not merely string-typed (Story 3.0 code review). The
    // guard previously accepted `""` and `"Oil Gas/../x"`, which contradicted this
    // module's own doctrine — it imports `isValidSlug` and applies it in
    // `prefillSlugOf` — and left a value that reaches a link href in Story 4.7's
    // admin unvalidated. `label` must be non-empty because it exists to be the
    // display snapshot; an empty one renders a blank row an admin cannot act on.
    // The `isNonEmptyString` test is not redundant: `isValidSlug` does `value.length`
    // unguarded, so a JSONB `null` would THROW — and this function's contract is
    // that arbitrary JSONB never throws.
    return isNonEmptyString(item.slug) && isValidSlug(item.slug) && isNonEmptyString(item.label);
  }
  // Free text is NOT slug-gated — that is the whole point of the variant — but an
  // empty entry is a phantom chip, never something the buyer typed.
  if (item.kind === "freeText") return isNonEmptyString(item.text);
  return false;
}

/** Narrow a raw JSONB value, dropping anything that does not match the contract. */
export function parseLeadEquipment(value: unknown): LeadEquipment {
  if (!Array.isArray(value)) return [];
  return value.filter(isLeadEquipmentItem);
}

// ---------------------------------------------------------------------------
// 4. Lead.prefillContext
// ---------------------------------------------------------------------------

/** The slug-shaped half of the vocabulary, as a type. */
export type SlugPrefillParam = (typeof SLUG_PREFILL_PARAMS)[number];

/**
 * `Lead.prefillContext` — WHICH DOORWAY THE BUYER CAME THROUGH, and what they
 * did with what it gave them.
 *
 * Story 3.0 froze the COLUMN (`Json @default("{}")`) but deliberately left the
 * JSON to whoever built the doorway. Freezing it HERE rather than at the call
 * site is the same argument as `LeadEquipmentItem` above: Story 4.7's admin
 * reads this back out of JSONB, so a shape minted ad hoc in the submit path
 * would become the de facto spec and this module would become a comment.
 *
 * SLUGS, NEVER IDS — the `Lead.industry` argument (see §2) applies unchanged. A
 * lead is a historical record and must survive its project being renamed,
 * re-slugged or deleted. `resolved` therefore holds only values that PASSED
 * `isValidSlug`; anything else is dropped rather than stored, because a value
 * that failed the gate can only have arrived by bypassing it.
 *
 * `query` is separate from `resolved` because `q` is BUYER TEXT, not a slug —
 * it is the one param the vocabulary does not slug-gate (see
 * `SLUG_PREFILL_PARAMS`), and it is stored as the sanitized value the form
 * actually pre-filled, not as the raw URL param.
 */
export interface PrefillContext {
  /** Doorway params that resolved to a real row, by param name. */
  resolved: Partial<Record<SlugPrefillParam, string>>;
  /** The sanitized `?q=` text, when the search doorway supplied a usable one. */
  query?: string;
  /** The buyer pressed Clear before submitting. */
  cleared: boolean;
  /** The buyer changed at least one value the pre-fill had seeded. */
  edited: boolean;
}

/** The context of a lead that came through no doorway at all. Identical to what
 *  the column's `{}` default parses to, so a cold lead and a cleared-to-nothing
 *  lead are not accidentally distinguishable by shape. */
export const EMPTY_PREFILL_CONTEXT: PrefillContext = {
  resolved: {},
  cleared: false,
  edited: false,
};

/**
 * Narrow a raw JSONB value. Same contract as `parseLeadEquipment`: NEVER THROWS
 * on arbitrary input, drops what does not match rather than rejecting the whole.
 */
export function parsePrefillContext(value: unknown): PrefillContext {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ...EMPTY_PREFILL_CONTEXT, resolved: {} };
  }
  const raw = value as Record<string, unknown>;

  const resolved: Partial<Record<SlugPrefillParam, string>> = {};
  const rawResolved = raw.resolved;
  if (typeof rawResolved === "object" && rawResolved !== null && !Array.isArray(rawResolved)) {
    const entries = rawResolved as Record<string, unknown>;
    for (const param of SLUG_PREFILL_PARAMS) {
      const slug = entries[param];
      // `isNonEmptyString` FIRST: `isValidSlug` does an unguarded `.length`, so a
      // JSONB `null` would throw and break the never-throws contract.
      if (isNonEmptyString(slug) && isValidSlug(slug)) resolved[param] = slug;
    }
  }

  const context: PrefillContext = {
    resolved,
    cleared: raw.cleared === true,
    edited: raw.edited === true,
  };
  // Not slug-gated, deliberately — see the docstring.
  if (isNonEmptyString(raw.query)) context.query = raw.query;
  return context;
}

/** True when nothing about this lead came from a doorway. */
export function isEmptyPrefillContext(context: PrefillContext): boolean {
  return (
    Object.keys(context.resolved).length === 0 &&
    context.query === undefined &&
    !context.cleared &&
    !context.edited
  );
}
