import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";

/**
 * The PUBLIC chrome (Story 4.1 refactor). Moved out of `[locale]/layout.tsx` so
 * the public header, the `<main>` skip-target and the footer wrap every public
 * page — but NOT `[locale]/admin`, which sits outside this route group and gets
 * its own frame. Public pages render identically to before: same components,
 * same order, same skip-link target.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/*
        Single <main> for the public segment — the skip-link target.
        `tabIndex={-1}` makes it programmatically focusable so activating the
        skip link actually MOVES focus (fragment navigation alone doesn't in
        Safari/Firefox). Flex column so children can claim the free height.
      */}
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col outline-none">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
