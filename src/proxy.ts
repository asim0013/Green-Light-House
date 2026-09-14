import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth/session";
import { protectedAdminLocale } from "./lib/auth/admin-path";

/**
 * Proxy — locale routing (Story 1.3) + the admin session guard (Story 4.1).
 *
 * Next.js 16.2 renamed the `middleware` file convention to `proxy`
 * (`src/proxy.ts`); next-intl v4 supports this file directly. This owns
 * next-intl locale routing (`/en`, `/tr`, `/ru`) and redirects `/` to a locale.
 *
 * ⚠️ THE ADMIN GUARD WRAPS i18n, in that order (the seam Story 1.3 documented).
 * i18n routing runs first so the path is locale-resolved, THEN `/[locale]/admin`
 * is gated on the `jose`-signed session cookie. Edge-safe: it only VERIFIES the
 * cookie (jose), never hashes (that is the node-runtime login route).
 *
 * ⚠️ THIS IS THE PAGE-NAVIGATION GATE, NOT THE ONLY ONE. The matcher excludes
 * `/api`, so `/api/admin/*` can never be guarded here — those are checked
 * in-handler via `requireAdmin()`, and every admin mutation checks server-side
 * regardless of this redirect (defence in depth — architecture:137, NFR6).
 *
 * ⚠️ THE LOGIN/RESET ROUTES ARE EXEMPT — gating them would lock the admin out
 * of the page that lets them back in.
 */
const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  const locale = protectedAdminLocale(request.nextUrl.pathname);
  if (locale) {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/admin/login`;
      url.search = "";
      url.searchParams.set("next", request.nextUrl.pathname);
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  // Match all pathnames except /api, Next internals, and files with a dot.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
