import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import {
  AdminDataTable,
  newLinkClass,
  editLinkClass,
} from "@/components/admin/catalog/AdminDataTable";
import { DeleteButton } from "@/components/admin/catalog/DeleteButton";
import { listProjectsForAdmin } from "@/server/repositories/project";
import { deleteProjectAction } from "@/server/admin/content/project-actions";

export default async function ProjectsListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listProjectsForAdmin(locale);

  return (
    <>
      <AdminTopbar
        title="Projects"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/content/projects/new" className={newLinkClass}>
            + New project
          </Link>
        }
      />
      <AdminDataTable
        caption="Projects"
        captionId="admin-projects-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No projects yet. Create the first one."
        columns={[
          { header: "Title", rowHeader: true, cell: (r) => r.title },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          {
            header: "Status",
            cell: (r) => (
              <span
                className={`rounded px-2 py-0.5 font-mono text-[11px] uppercase ${
                  r.status === "published"
                    ? "bg-accent-soft/20 text-ink"
                    : "bg-surface-2 text-muted"
                }`}
              >
                {r.status}
              </span>
            ),
          },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/content/projects/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteProjectAction} id={r.id} label={r.title} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
