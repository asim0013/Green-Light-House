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
import { listTeamMembers } from "@/server/repositories/team";
import { deleteTeamMemberAction } from "@/server/admin/content/team-actions";

export default async function TeamListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listTeamMembers(locale);

  return (
    <>
      <AdminTopbar
        title="Team"
        subtitle={`${rows.length} member(s) · public page arrives in Epic 5`}
        actions={
          <Link href="/admin/content/team/new" className={newLinkClass}>
            + New member
          </Link>
        }
      />
      <AdminDataTable
        caption="Team members"
        captionId="team-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No team members yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          {
            header: "Order",
            align: "right",
            cell: (r) => <span className="font-data">{r.order}</span>,
          },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/content/team/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteTeamMemberAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
