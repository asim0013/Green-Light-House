import { NotFoundContent } from "@/components/layout/NotFoundContent";

/**
 * The boundary for an EXPLICIT `notFound()` call inside a locale route — Epic 2's
 * unknown product/industry slugs will be the first real callers.
 *
 * Unmatched URLs do NOT come here; they are handled by `app/global-not-found.tsx`,
 * because a `not-found` boundary under a top-level dynamic segment renders outside
 * `[locale]/layout.tsx` (measured in Story 1.9 — see that file's header). Both
 * render the same `NotFoundContent`, so the two cannot drift.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
