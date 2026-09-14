import type { Metadata } from "next";
import type { ReactNode } from "react";

/**
 * The admin frame (Story 4.1). Deliberately minimal — a centered card on a plain
 * ground, no public header/footer/RFQ CTA. The real admin app shell (dark
 * sidebar + topbar) is Story 4.2; this only needs to hold the login/reset forms
 * and, post-auth, the placeholder landing.
 *
 * ⚠️ NOINDEX. The admin — including the pre-auth login page, which IS publicly
 * reachable — must never be indexed. Applied here so every admin route inherits
 * it.
 *
 * ⚠️ ADMIN COPY IS NOT LOCALIZED AT LAUNCH (single operator, no role hierarchy —
 * PRD §7.12). The strings here are inline English on purpose; localizing the
 * admin UI is out of scope for Epic 4 and would add a 3-locale burden to a
 * single-user tool. The public site remains fully EN/TR/RU.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-surface-2 px-4 py-12">
      <div className="w-full max-w-sm">
        <p className="mb-6 text-center font-mono text-[11px] font-normal uppercase tracking-[0.18em] text-ink-2">
          GREENLIGHTHOUSE · Admin
        </p>
        {children}
      </div>
    </main>
  );
}
