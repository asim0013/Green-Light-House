import createMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

/**
 * Proxy — locale routing (Story 1.3).
 *
 * Next.js 16.2 renamed the `middleware` file convention to `proxy`
 * (`src/proxy.ts`); next-intl v4 supports this file directly. This owns
 * next-intl locale routing (`/en`, `/tr`, `/ru`) and redirects `/` to a locale.
 *
 * Composition seam: the `/[locale]/admin` Auth.js session guard (Story 4.1)
 * wraps around `handleI18nRouting` here — run i18n routing first, then gate
 * admin routes on the resulting (possibly rewritten) path. Kept as a named
 * `proxy` function for that reason rather than a bare default export.
 */
const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  return handleI18nRouting(request);
}

export const config = {
  // Match all pathnames except /api, Next internals, and files with a dot.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
