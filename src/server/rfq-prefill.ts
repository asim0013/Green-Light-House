import type { Locale } from "@prisma/client";
import { listCategoryTree, type CategoryTreeNode } from "@/server/repositories/category";
import { getProductBySlug } from "@/server/repositories/product";
import { queryProjectPrefill, type PrefillName } from "@/server/repositories/project";
import type { IndustryListItem } from "@/server/repositories/industry";
import { SLUG_PREFILL_PARAMS, type LeadEquipmentItem } from "@/server/rfq/contracts";
import type { PrefillParams } from "@/server/rfq/prefill";

/**
 * The per-surface pre-fill reader for `/rfq` (Story 3.4).
 *
 * Sits alongside `rfq-page.ts` for the same reason it does: the PAGE owns the
 * reads, the island owns the behaviour. Story 3.8 mounts the same island on
 * `/contact`, so the shape this returns is the shape `/contact` will also have
 * to satisfy — keep it a plain data model with no React in it.
 *
 * ⚠️ CACHING, STATED EXACTLY — an earlier version of this comment claimed
 * "EVERY READ HERE IS UNCACHED", and that was false (3.4 review). Per param:
 *
 *   ?project=  `queryProjectPrefill` — genuinely UNCACHED. This is the read the
 *              story added, and the one Task 0 #38 was about: its payload is
 *              keyed by an attacker-supplied slug and embeds category names that
 *              depend on product status, so a per-slug entry here would be both
 *              a cardinality amplifier AND a correctness trap.
 *   ?industry= resolved off the list the PAGE already loaded, keyed by locale.
 *              Zero new entries.
 *   ?category= `listCategoryTree(locale)` — cached, but keyed by LOCALE ONLY.
 *              Three entries total, none attacker-influenced.
 *   ?product=  `getProductBySlug` — cached. The detail entry is keyed by ID, but
 *              the slug→id hop underneath it (`product-id:{slug}`) stores a null
 *              for an unknown slug, so a fabricated slug does mint one entry.
 *
 * That last one is a REAL but PRE-EXISTING item: the same key space is already
 * reachable through `/products/{slug}`, `resolveProductId`'s own docstring names
 * it, and it is on the deferred list as an unbounded-cardinality issue. This
 * page adds another route to it, not a new exposure — and one request can touch
 * it once, exactly as one product-detail request can. Fixing it belongs with the
 * other negative-caching sites, not here.
 *
 * The page is already `force-dynamic`.
 */

/** One resolved doorway, ready to render and to seed the form. */
export interface RfqPrefill {
  /**
   * The GATED params exactly as they arrived, carried through untouched.
   *
   * ⚠️ NOT RECONSTRUCTABLE FROM THE RESOLVED MODEL, which is why they travel.
   * `?project=` resolves into an industry and category chips — nothing in the
   * output still says "project" — so a form that rebuilt the params from what it
   * can see would attribute a project lead as `product` or as `direct`. These
   * ride back to `POST /api/rfq` in the payload so the server can re-resolve
   * `Lead.source` from the same input the page used.
   */
  params: PrefillParams;
  /**
   * The SUBSET of `params` that resolved to a real, published row.
   *
   * ⚠️ ADDED BY THE 3.4 REVIEW, which found `Lead.prefillContext.resolved` being
   * filled from `params` — so a slug naming nothing was recorded as though it
   * had resolved, contradicting the field's own frozen docstring in
   * `contracts.ts`. `q` is carried here whenever it survived its gates: it is
   * buyer text, so "resolving" it means nothing more than that.
   */
  resolved: PrefillParams;
  /**
   * Which doorway the banner should name — the precedence winner, or `null`
   * when nothing resolved and there is therefore nothing to show.
   *
   * ⚠️ NULLABLE SINCE THE 3.4 REVIEW, and the nullability is the whole point:
   * rendering and attribution are separate questions. See `resolveRfqPrefill`.
   */
  doorway: "project" | "product" | "industry" | "category" | "search" | null;
  /** Industry slug to pre-select, when one resolved. */
  industry: PrefillName | null;
  /** Equipment chips to pre-load, already de-duplicated and ordered. */
  equipment: LeadEquipmentItem[];
  /** Per-chip fallback marking, parallel to `equipment` (UX-DR21). */
  equipmentFallback: boolean[];
  /** The sanitized `?q=` text destined for the project-description field. */
  query?: string;
}

/**
 * How many chips a doorway may pre-load.
 *
 * ⚠️ BELOW THE SCHEMA'S CAP OF 20, DELIBERATELY. `rfqSchema` rejects more than 20
 * equipment items and nothing de-duplicates on the client, so a project linking
 * products across many categories could otherwise pre-fill an ALREADY-INVALID
 * form — the buyer arrives at something that refuses to submit and cannot see
 * why. Leaving headroom also lets them add their own before hitting the ceiling.
 */
export const PREFILL_CHIP_BUDGET = 12;

function chipOf(item: PrefillName, kind: "product" | "category"): LeadEquipmentItem {
  return { kind, slug: item.slug, label: item.name };
}

/**
 * Resolve the gated params into a render model, or `null` when nothing resolved.
 *
 * NEVER THROWS and never 404s: a doorway URL naming a row that does not exist,
 * or one that is not published, yields `null` and the RFQ renders exactly as it
 * does for a cold visit. A mistyped link must never cost the buyer their
 * inquiry.
 */
export async function resolveRfqPrefill(
  params: PrefillParams,
  locale: Locale,
  /** The industry list the page has ALREADY loaded for its select. Reusing it
   *  costs zero new cache entries and is the SAME list `POST /api/rfq` validates
   *  against, so pre-fill and submit can never disagree about what exists. */
  industries: readonly IndustryListItem[],
): Promise<RfqPrefill | null> {
  const equipment: LeadEquipmentItem[] = [];
  const equipmentFallback: boolean[] = [];
  const resolved: PrefillParams = {};
  let industry: PrefillName | null = null;

  const push = (item: PrefillName, kind: "product" | "category") => {
    if (equipment.length >= PREFILL_CHIP_BUDGET) return;
    if (
      equipment.some(
        (existing) => existing.kind === kind && "slug" in existing && existing.slug === item.slug,
      )
    ) {
      return;
    }
    equipment.push(chipOf(item, kind));
    equipmentFallback.push(item.isFallback);
  };

  // --- ?project= : industry + the distinct categories of its published products
  if (params.project) {
    const project = await queryProjectPrefill(params.project, locale);
    if (project) {
      resolved.project = params.project;
      industry = project.industry;
      for (const category of project.categories) push(category, "category");
    }
  }

  // --- ?product= : the product AND its category, both individually removable
  if (params.product) {
    const product = await getProductBySlug(params.product, locale);
    if (product) {
      resolved.product = params.product;
      push({ slug: product.slug, name: product.name, isFallback: product.isFallback }, "product");
      // Defensive only: `ProductDetail.category` is non-nullable (`product.ts`)
      // and `categoryId` is a required column, so this branch cannot be false
      // through the shipped read — the "and its category" half of AC3 is
      // unconditional in practice. Kept narrow rather than asserted, but do not
      // read it as evidence that an uncategorised product exists (3.4 review).
      if (product.category) {
        push(
          {
            slug: product.category.slug,
            name: product.category.name,
            isFallback: product.category.isFallback,
          },
          "category",
        );
      }
    }
  }

  // --- ?industry= : resolved off the already-loaded list, never a fresh read
  if (params.industry) {
    const match = industries.find((candidate) => candidate.slug === params.industry);
    if (match) {
      // Recorded as resolved whether or not it wins the SELECT: a project
      // doorway that also carried `?industry=` still resolved that param, and
      // `prefillContext` records what resolved, not what was displayed.
      resolved.industry = params.industry;
      if (!industry) {
        industry = { slug: match.slug, name: match.name, isFallback: match.isFallback };
      }
    }
  }

  // --- ?category= : a chip, not an origin. Frozen and accepted since Story 3.0;
  //     Story 3.4 resolves it but ships NO emitter, so it is reachable only by a
  //     hand-typed URL until some later story amends a CTA.
  if (params.category) {
    const tree = await listCategoryTree(locale);
    const node = findCategoryNode(tree, params.category);
    if (node) {
      resolved.category = params.category;
      push({ slug: node.slug, name: node.name, isFallback: node.isFallback }, "category");
    }
  }
  // `q` needs no lookup — it is the buyer's own text and already passed
  // `searchQueryOf` composed with `isStorableText` at the page seam.
  if (params.q) resolved.q = params.q;

  // ⚠️ A DOORWAY THAT RESOLVED NOTHING STILL CARRIES ATTRIBUTION (3.4 review).
  // This returned `null` whenever `doorwayOf` found nothing to SHOW, which also
  // threw the params away: `/rfq?project=<unpublished-or-unknown>` reached the
  // island as a cold visit, sent no `prefill` payload, and persisted as
  // `direct` — silently contradicting the docstring on `doorwayOf` below, which
  // states that a doorway resolving nothing "is still where the buyer came
  // from". Rendering and attribution are now separate: `doorway` is null when
  // there is nothing to display, while `params` travel regardless so
  // `POST /api/rfq` can still record the origin.
  if (!hasAnyParam(params)) return null;

  const prefill: RfqPrefill = {
    params,
    resolved,
    doorway: doorwayOf(params, industry, equipment.length),
    industry,
    equipment,
    equipmentFallback,
  };
  if (params.q) prefill.query = params.q;
  return prefill;
}

/** Did the URL carry any gated doorway param at all? The one condition under
 *  which there is genuinely nothing to carry — a cold visit. */
function hasAnyParam(params: PrefillParams): boolean {
  return SLUG_PREFILL_PARAMS.some((param) => params[param]) || Boolean(params.q);
}

/**
 * Which doorway the BANNER names.
 *
 * Distinct from `resolvePrefillSource`, which answers a different question: that
 * one decides `Lead.source`, this one decides what to SHOW — the AC's "no empty
 * banner, no placeholder text" depends on that difference.
 *
 * ⚠️ THE TWO WALK DIFFERENT MEMBER LISTS, and that divergence is user-visible
 * (3.4 review). `PREFILL_PRECEDENCE` has four members and deliberately EXCLUDES
 * `category` — a category is equipment context, not an origin, and `LeadSource`
 * has no member to write. This function has five branches and DOES name
 * `category`, because a resolved category chip is something to show.
 *
 * So `/rfq?category=flame-detectors&q=fd9500` shows the buyer "Pre-filled from
 * the category you were viewing…" while the lead records `source: search`. Both
 * are individually correct and the pair reads as a contradiction in Story 4.7's
 * admin. Left as-is rather than "fixed": changing the precedence list breaks a
 * frozen cross-story contract, and changing this one would show a banner naming
 * a doorway whose chip is not the one that resolved. Reachable only by a
 * hand-typed URL today — 3.4 ships no `?category=` emitter — but written down
 * here so whoever adds one decides deliberately.
 */
function doorwayOf(
  params: PrefillParams,
  industry: PrefillName | null,
  chips: number,
): RfqPrefill["doorway"] | null {
  if (params.project && (industry || chips > 0)) return "project";
  if (params.product && chips > 0) return "product";
  if (params.industry && industry) return "industry";
  if (params.category && chips > 0) return "category";
  if (params.q) return "search";
  return null;
}

/** Depth-agnostic walk — the seed is two levels today, and the catalogue's own
 *  readers are already depth-agnostic (2.2). */
function findCategoryNode(
  nodes: readonly CategoryTreeNode[],
  slug: string,
): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const child = findCategoryNode(node.children, slug);
    if (child) return child;
  }
  return null;
}
