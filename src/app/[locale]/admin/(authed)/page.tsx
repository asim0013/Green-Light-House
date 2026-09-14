import { AdminTopbar } from "@/components/admin/AdminTopbar";

/**
 * The admin dashboard (Story 4.2). The session is already guaranteed by the
 * `(authed)/layout.tsx` guard, so this is just the landing surface. Deliberately
 * minimal for now — a welcome/overview; real at-a-glance metrics and queues
 * arrive with the modules they summarise (Inquiries counts in 4.7, etc.).
 */
export default function AdminDashboardPage() {
  return (
    <>
      <AdminTopbar title="Dashboard" subtitle="Admin workspace" />
      <div className="p-8">
        <p className="max-w-prose text-[14px] leading-relaxed text-ink-2">
          Welcome to the GREENLIGHTHOUSE admin. Modules become available in the sidebar as they come
          online — Inquiries, Catalog, Content, Media, Documents and Settings are on the way.
        </p>
      </div>
    </>
  );
}
