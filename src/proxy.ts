import { NextResponse } from "next/server";

/**
 * Proxy — stub (Story 1.1).
 *
 * Next.js 16.2 renamed the `middleware` file convention to `proxy`
 * (`src/proxy.ts`, exported function `proxy`).
 *
 * Intentionally a pass-through for now. It will own:
 *   - next-intl locale routing (`/en`, `/tr`, `/ru`) — Story 1.3
 *   - `/[locale]/admin` auth guard (Auth.js session check) — Story 4.1
 *
 * Do not add business logic here beyond routing/auth concerns.
 */
export function proxy() {
  return NextResponse.next();
}

export const config = {
  // Exclude Next internals and static assets; refined when i18n/auth land.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
