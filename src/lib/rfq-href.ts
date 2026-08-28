import { SITE } from "@/config/site";

/**
 * The doorway href builders (Story 3.4).
 *
 * ONE PLACE, for the same reason `catalog-href.ts` exists: three CTAs across
 * three components emit these, and a hand-concatenated query string drifts —
 * a forgotten `encodeURIComponent` on one of them is a defect nobody sees until
 * a slug contains something interesting.
 *
 * SINGLE-VALUED BY CONSTRUCTION. Each builder emits exactly ONE param, which is
 * the frozen vocabulary's own rule: repeatable params are rejected, not merged
 * (`contracts.ts` — `?product=a&product=b` takes `a`). A multi-item inquiry is
 * built by editing the form, not by URL.
 *
 * ⚠️ NEVER A LABEL, ALWAYS A SLUG. The banner's text is resolved server-side
 * from the slug so it can be localized and fallback-marked; putting a display
 * name in the URL would both defeat that and let a crafted link put arbitrary
 * text on the page.
 */

function doorway(param: "project" | "product" | "industry" | "category", slug: string): string {
  return `${SITE.rfqHref}?${param}=${encodeURIComponent(slug)}`;
}

/**
 * "I have a similar project" — the project detail band.
 *
 * ⚠️ NO CALLER, like `rfqCategoryHref` below. That band shipped in Story 3.1
 * and `ProjectCta` still builds the same URL by hand, so this builder is the
 * canonical spelling rather than the one in use. Said plainly because the
 * previous wording — "(shipped in 3.1)" — read as naming a caller that is
 * actually a different expression in a different file (3.4 review). Whoever
 * touches `ProjectCta` next should route it through here.
 */
export function rfqProjectHref(slug: string): string {
  return doorway("project", slug);
}

/** The product anchor card's inquiry CTA. */
export function rfqProductHref(slug: string): string {
  return doorway("product", slug);
}

/** Both industry CTAs — the hero and the closing band. */
export function rfqIndustryHref(slug: string): string {
  return doorway("industry", slug);
}

/**
 * The category doorway. FROZEN AND ACCEPTED since Story 3.0, and resolved by
 * Story 3.4 — but 3.4 deliberately ships NO EMITTER for it, so this builder has
 * no caller yet. It exists so that whoever adds the first one (the natural host
 * is the catalogue's empty-category state) reuses the encoding rule rather than
 * writing a fourth concatenation. `category` is EQUIPMENT context, not an
 * origin: it has no `LeadSource` member and is absent from `PREFILL_PRECEDENCE`.
 */
export function rfqCategoryHref(slug: string): string {
  return doorway("category", slug);
}
