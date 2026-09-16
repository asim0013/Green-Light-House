import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/auth/guard";
import { findAdminById } from "@/server/repositories/admin-user";
import { AdminSidebar } from "@/components/admin/AdminSidebar";

/**
 * The AUTHENTICATED admin shell (Story 4.2) — dark 244px sidebar + a light main
 * column. Wraps every logged-in admin route; the logged-out login/reset pages
 * live in the sibling `(auth)/` group and never see this.
 *
 * ⚠️ DEFENCE IN DEPTH (architecture:137). The proxy already redirects an
 * unauthenticated request, but this layout checks the session server-side too —
 * the middleware is not the only gate, and a session for a deleted admin is also
 * rejected. The admin email is read HERE (server) and passed to the client
 * sidebar as a prop, so no client component imports the repository/Prisma.
 */
export default async function AdminAuthedLayout(props: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  const session = await getAdminSession();
  if (!session) redirect(`/${locale}/admin/login`);
  const admin = await findAdminById(session.sub);
  if (!admin) redirect(`/${locale}/admin/login`); // session for a since-deleted admin

  return (
    <div className="flex min-h-screen bg-surface">
      <AdminSidebar adminEmail={admin.email} locale={locale} />
      <div className="flex min-w-0 flex-1 flex-col">{props.children}</div>
    </div>
  );
}
