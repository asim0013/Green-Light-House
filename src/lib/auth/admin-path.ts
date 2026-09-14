import { routing } from "@/i18n/routing";

/**
 * Which `/[locale]/admin` paths the proxy must gate (Story 4.1). Extracted from
 * `src/proxy.ts` so the matching is unit-testable in isolation — the guard's
 * scope is the load-bearing security decision and must be falsifiable.
 *
 * Locales come from `routing`, the single source; a fourth locale is covered
 * without editing this. The login/forgot/reset subpaths are EXEMPT — gating them
 * would lock the admin out of the pages that let them back in.
 */
const ADMIN_PATH = new RegExp(`^/(${routing.locales.join("|")})/admin(/.*)?$`);
const AUTH_SUBPATHS = ["/login", "/forgot", "/reset"];

/**
 * The locale if `pathname` is a PROTECTED admin path (admin, but not an auth
 * subpath); otherwise null (public path, or an exempt login/reset page).
 */
export function protectedAdminLocale(pathname: string): string | null {
  const match = ADMIN_PATH.exec(pathname);
  if (!match) return null;
  const sub = match[2] ?? "";
  const isAuthRoute = AUTH_SUBPATHS.some((p) => sub === p || sub.startsWith(`${p}/`));
  return isAuthRoute ? null : match[1];
}
