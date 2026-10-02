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
import { listGuidesForAdmin } from "@/server/repositories/selection-guide";
import { deleteGuideAction } from "@/server/admin/guides/actions";

export default async function GuidesListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listGuidesForAdmin(locale);

  return (
    <>
      <AdminTopbar
        title="Selection guides"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/content/guides/new" className={newLinkClass}>
            + New guide
          </Link>
        }
      />
      <AdminDataTable
        caption="Selection guides"
        captionId="guides-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No guides yet. Create the first one."
        columns={[
          { header: "Title", rowHeader: true, cell: (r) => r.title },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          { header: "Status", cell: (r) => r.status },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/content/guides/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteGuideAction} id={r.id} label={r.title} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
