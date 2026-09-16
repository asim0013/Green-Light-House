import type { ReactNode } from "react";

/**
 * The logged-OUT admin frame (Story 4.2) — the bare centered card that holds
 * login / forgot / reset. Moved verbatim from 4.1's `admin/layout.tsx`; these
 * pages are reachable without a session, so they must NEVER get the
 * authenticated sidebar shell (that lives in the `(authed)/` group).
 *
 * Route groups don't change the URL — `/[locale]/admin/login` is unchanged, so
 * the proxy's `protectedAdminLocale` exemption still matches.
 */
export default function AdminAuthLayout({ children }: { children: ReactNode }) {
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
