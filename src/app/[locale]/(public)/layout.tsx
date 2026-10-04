import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { ConsentBanner } from "@/components/consent/ConsentBanner";
import { getSitePhone } from "@/server/repositories/site-settings";
import { CONSENT_COOKIE } from "@/lib/consent";

/**
 * The PUBLIC chrome (Story 4.1 refactor). Moved out of `[locale]/layout.tsx` so
 * the public header, the `<main>` skip-target and the footer wrap every public
 * page — but NOT `[locale]/admin`, which sits outside this route group and gets
 * its own frame. Public pages render identically to before: same components,
 * same order, same skip-link target.
 *
 * ⚠️ ASYNC + DB-READING SINCE STORY 4.8: it reads `getSitePhone()` so the client
 * `SiteHeader` gets the admin-managed phone as a PROP (a client component must
 * never import a `@/server/**` reader — that drags Prisma into the bundle and
 * 500s every page). Every public page it wraps is `force-dynamic`, and this
 * layout declares the same, so the read is always at request time and never
 * breaks the Postgres-free build.
 */
export const dynamic = "force-dynamic";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const phone = await getSitePhone();
  // Story 5.2: decide the consent banner's initial visibility on the SERVER (read
  // the cookie) so there is no flash of a banner that then vanishes. Show it only
  // when the visitor has made no choice yet (privacy-first default = denied).
  const consent = (await cookies()).get(CONSENT_COOKIE)?.value;
  const showConsent = consent !== "granted" && consent !== "denied";
  return (
    <>
      <SiteHeader phone={phone} />
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
      <ConsentBanner initialShow={showConsent} />
    </>
  );
}
