import { redirect } from "next/navigation";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { getAdminSession } from "@/lib/auth/guard";
import { findAdminById } from "@/server/repositories/admin-user";

/**
 * The admin landing (Story 4.1). The proxy already redirects an unauthenticated
 * request here, but this ALSO checks the session server-side — defence in depth
 * (architecture:137, NFR6): the middleware redirect is not the only gate. The
 * real dashboard/app shell is Story 4.2; this is the minimal signed-in surface
 * plus logout.
 */
export default async function AdminHomePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);

  const admin = await findAdminById(session.sub);
  if (!admin) redirect(`/${locale}/admin/login`); // session for a deleted admin

  return (
    <div className="border border-border-subtle bg-surface p-6">
      <h1 className="mb-2 font-heading text-[18px] font-bold tracking-tight text-ink">Signed in</h1>
      <p className="mb-4 text-[13px] text-ink-2">
        {admin.email} — the admin workspace is coming in the next story.
      </p>
      <form method="post" action="/api/admin/logout">
        <input type="hidden" name="locale" value={locale} />
        <button type="submit" className={buttonClasses("secondary", "min-h-11 w-full")}>
          Sign out
        </button>
      </form>
    </div>
  );
}
