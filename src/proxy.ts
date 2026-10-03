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

/**
 * The per-request Content-Security-Policy (Story 5.7 — NFR6).
 *
 * ⚠️ NONCE, not `'unsafe-inline'`, for scripts. Next's App Router emits inline
 * RSC-flight `<script>`s; a nonce lets them run while blocking injected inline
 * script (the real XSS defence). `'strict-dynamic'` lets those trusted scripts
 * load the chunks they need without an allowlist. `style-src 'unsafe-inline'` is
 * accepted: `next/font` injects inline `<style>`, and inline styles are a low XSS
 * risk. No third-party origins — FR46 forbids them, and the maps link is an
 * outbound `<a>`, not a fetch. `frame-ancestors 'none'` pairs with the static
 * `X-Frame-Options: DENY` in `next.config`.
 */
function buildCsp(nonce: string): string {
  // ⚠️ DEV ONLY loosening — NEVER reaches production. `next dev` needs React's
  // dev-mode `eval()` (`'unsafe-eval'`) and the HMR websocket (`ws:` in
  // connect-src); production uses neither (React never evals in prod, there is no
  // HMR socket). Gated on NODE_ENV so the SHIPPED policy stays strict.
  const isDev = process.env.NODE_ENV === "development";
  const scriptExtra = isDev ? " 'unsafe-eval'" : "";
  const connectExtra = isDev ? " ws: http://localhost:*" : "";
  return [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${scriptExtra}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    `connect-src 'self'${connectExtra}`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `object-src 'none'`,
  ].join("; ");
}

export default async function proxy(request: NextRequest) {
  // A fresh nonce per request. Set it on the INCOMING request headers: next-intl
  // clones `request.headers` into the rewrite/next it forwards (verified in its
  // source), so `x-nonce` + the CSP reach the renderer, and Next reads the CSP
  // request header to apply the nonce to its inline scripts. Edge-safe
  // (`crypto.randomUUID` is a Web Crypto API available in the edge runtime).
  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce);
  request.headers.set("x-nonce", nonce);
  request.headers.set("content-security-policy", csp);

  const response = handleI18nRouting(request);

  const locale = protectedAdminLocale(request.nextUrl.pathname);
  if (locale) {
    const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session) {
      const url = request.nextUrl.clone();
      url.pathname = `/${locale}/admin/login`;
      url.search = "";
      url.searchParams.set("next", request.nextUrl.pathname);
      const redirect = NextResponse.redirect(url);
      redirect.headers.set("content-security-policy", csp);
      return redirect;
    }
  }

  // Enforce on the response the browser sees.
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Match all pathnames except /api, Next internals, and files with a dot.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
