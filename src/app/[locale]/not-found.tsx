import { NotFoundContent } from "@/components/layout/NotFoundContent";

/**
 * The boundary for an EXPLICIT `notFound()` call inside a locale route.
 *
 * STILL EFFECTIVELY UNREACHED as of Story 2.1, and that was a deliberate choice
 * rather than an oversight. This file previously predicted that Epic 2's unknown
 * industry slugs would be its first callers; they are not. Story 2.1 measured all
 * six available options and found that NONE yields both a real 404 status and
 * correct `lang`/chrome on this codebase — an explicit `notFound()` still renders
 * here inside Next's bare `<html id="__next_error__">` shell, with no `lang`, no
 * header and no footer. Rather than reintroduce the WCAG 3.1.1 Level A failure
 * Story 1.9 closed, the industry route renders an in-layout "not found" body with an
 * explicit `noindex` and accepts a soft 404. See
 * `src/components/industry/IndustryNotFound.tsx` for the full measurement table.
 *
 * So this boundary remains a safety net for the layout's own locale guard, not a
 * surface Epic 2 routes through. If a future Next release renders nested
 * `not-found` inside a top-level dynamic layout, that trade can be revisited and
 * this file becomes the better answer again.
 *
 * Unmatched URLs do NOT come here; they are handled by `app/global-not-found.tsx`,
 * because a `not-found` boundary under a top-level dynamic segment renders outside
 * `[locale]/layout.tsx` (measured in Story 1.9 — see that file's header). Both
 * render the same `NotFoundContent`, so the two cannot drift.
 */
export default function NotFound() {
  return <NotFoundContent />;
}
