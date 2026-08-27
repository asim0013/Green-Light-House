import type { Locale } from "@prisma/client";
import { listCategoryTree, type CategoryTreeNode } from "@/server/repositories/category";
import { getProductBySlug } from "@/server/repositories/product";
import { queryProjectPrefill, type PrefillName } from "@/server/repositories/project";
import type { IndustryListItem } from "@/server/repositories/industry";
import type { LeadEquipmentItem } from "@/server/rfq/contracts";
import type { PrefillParams } from "@/server/rfq/prefill";

/**
 * The per-surface pre-fill reader for `/rfq` (Story 3.4).
 *
 * Sits alongside `rfq-page.ts` for the same reason it does: the PAGE owns the
 * reads, the island owns the behaviour. Story 3.8 mounts the same island on
 * `/contact`, so the shape this returns is the shape `/contact` will also have
 * to satisfy — keep it a plain data model with no React in it.
 *
 * ⚠️ EVERY READ HERE IS UNCACHED, and that is a security posture rather than a
 * performance oversight. `/rfq` accepts up to four attacker-controlled slugs on
 * ONE URL and `PREFILL_PRECEDENCE` decides `Lead.source` only, so every present
 * param still has to resolve for `prefillContext` — caching per-slug would make
 * this the cheapest cache-cardinality amplifier on the site. The page is already
 * `force-dynamic`.
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
  /** Which doorway the banner should name — the precedence winner. */
  doorway: "project" | "product" | "industry" | "category" | "search";
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
  let industry: PrefillName | null = null;

  const push = (item: PrefillName, kind: "product" | "category") => {
    if (equipment.length >= PREFILL_CHIP_BUDGET) return;
    if (equipment.some((existing) => existing.kind === kind && "slug" in existing && existing.slug === item.slug)) {
      return;
    }
    equipment.push(chipOf(item, kind));
    equipmentFallback.push(item.isFallback);
  };

  // --- ?project= : industry + the distinct categories of its published products
  if (params.project) {
    const project = await queryProjectPrefill(params.project, locale);
    if (project) {
      industry = project.industry;
      for (const category of project.categories) push(category, "category");
    }
  }

  // --- ?product= : the product AND its category, both individually removable
  if (params.product) {
    const product = await getProductBySlug(params.product, locale);
    if (product) {
      push({ slug: product.slug, name: product.name, isFallback: product.isFallback }, "product");
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
  if (params.industry && !industry) {
    const match = industries.find((candidate) => candidate.slug === params.industry);
    if (match) industry = { slug: match.slug, name: match.name, isFallback: match.isFallback };
  }

  // --- ?category= : a chip, not an origin. Frozen and accepted since Story 3.0;
  //     Story 3.4 resolves it but ships NO emitter, so it is reachable only by a
  //     hand-typed URL until some later story amends a CTA.
  if (params.category) {
    const tree = await listCategoryTree(locale);
    const node = findCategoryNode(tree, params.category);
    if (node) push({ slug: node.slug, name: node.name, isFallback: node.isFallback }, "category");
  }

  const doorway = doorwayOf(params, industry, equipment.length);
  if (!doorway) return null;

  const prefill: RfqPrefill = { params, doorway, industry, equipment, equipmentFallback };
  if (params.q) prefill.query = params.q;
  return prefill;
}

/**
 * Which doorway the BANNER names.
 *
 * Distinct from `resolvePrefillSource`, which answers a different question:
 * that one decides `Lead.source` from the params ALONE (a doorway that resolved
 * nothing is still where the buyer came from). This one decides what to SHOW,
 * so it only counts context that actually resolved — the AC's "no empty banner,
 * no placeholder text" depends on exactly that difference.
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
function findCategoryNode(nodes: readonly CategoryTreeNode[], slug: string): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.slug === slug) return node;
    const child = findCategoryNode(node.children, slug);
    if (child) return child;
  }
  return null;
}
