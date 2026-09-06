import type { SlaContent } from "@/server/repositories/sla";

/**
 * Presentational predicates for SLA content — safe to import from a COMPONENT.
 *
 * ⚠️ THIS FILE EXISTS BECAUSE OF A REAL REGRESSION, and the reason is worth
 * keeping. The predicate below first lived in `src/server/repositories/sla.ts`
 * beside the shape it tests. Importing it from the six summary components turned
 * their previously TYPE-ONLY import of that module into a VALUE import — and
 * `sla.ts` pulls in `@/lib/db` (a `PrismaClient`) and `@/lib/cache`
 * (`next/cache`). Every public page began answering 500, and the catalog suite
 * failed with `Internal Server Error` on assertions that had nothing to do with
 * the SLA.
 *
 * The import of `SlaContent` here is `import type`, which the compiler erases,
 * so this module has NO runtime dependencies at all. Keep it that way: anything
 * a component needs to know about SLA content belongs here, and anything that
 * needs Prisma or the cache belongs in the repository.
 */

/**
 * Is there a one-line sentence worth drawing chrome around?
 *
 * ⚠️ THE SEVEN SUMMARY SURFACES MUST GUARD ON THIS, NOT ON `sla` ALONE. Each wraps
 * the sentence in its own typography — the homepage rules a border above it, four
 * sit on dark bands — and `HomeHero`'s guard even carried the comment "border
 * would otherwise draw above nothing" while testing only that the ROW exists. An
 * admin who blanks the summary in Story 4.8, or a locale row saved with
 * whitespace, produces a non-null `SlaContent` whose summary is empty: every one
 * of the six then drew its rule, its padding and its uppercase frame around
 * nothing at all.
 *
 * Stepper surfaces have the equivalent guard on `steps.length` — a row can be
 * legitimately summary-only or step-only, and neither surface may assume the
 * other's content is present.
 */
export function hasSlaSummary(sla: SlaContent | null): sla is SlaContent {
  return sla !== null && sla.summary.trim().length > 0;
}
