import { revalidateTag } from "next/cache";

/**
 * In-process cache revalidation (Story 4.3).
 *
 * The importable form of what `POST /api/revalidate` does. Epic 4's admin
 * mutations call THIS directly after a create/update/delete rather than making
 * an HTTP hop back into their own process. The route
 * (`src/app/api/revalidate/route.ts`) now delegates here too, so the
 * `revalidateTag` call — and the load-bearing `"max"` profile note — lives in
 * exactly ONE place.
 *
 * Callers pass tags built from `@/lib/cache-tags` (`TAGS.*`), never hand-written
 * strings: a mistyped tag turns `revalidateTag` into a silent no-op, so an
 * admin's edit never goes live and the symptom looks like ordinary staleness.
 */
export function revalidateTags(tags: readonly string[]): void {
  for (const tag of tags) {
    // Next 16.2 requires a cache profile as the second argument (typed
    // `string | CacheLifeConfig`, not optional). `"max"` is a TRUE immediate
    // purge here because `cache-handler.js` ignores the profile and simply
    // stamps the tag — a property of OUR handler, not the profile name — which
    // is the behaviour an admin publish needs. Full reasoning in the route.
    revalidateTag(tag, "max");
  }
}
