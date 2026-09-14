import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The OUTER admin layer (Story 4.1, restructured in 4.2). Deliberately thin — it
 * carries only the noindex directive that every admin route inherits; the two
 * route groups supply their own frames:
 *   - `(auth)/`   — the logged-OUT pages (login/forgot/reset) on a bare card;
 *   - `(authed)/` — the authenticated shell (dark sidebar + topbar).
 *
 * ⚠️ NOINDEX. The admin — including the pre-auth login page, which IS publicly
 * reachable — must never be indexed.
 *
 * ⚠️ ADMIN COPY IS NOT LOCALIZED AT LAUNCH (single operator — PRD §7.12). Inline
 * English throughout the admin; the public site stays fully EN/TR/RU.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
