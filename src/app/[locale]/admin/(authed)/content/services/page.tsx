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
import { listServiceOptions } from "@/server/repositories/service";
import { deleteServiceAction } from "@/server/admin/content/service-actions";

export default async function ServicesListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listServiceOptions(locale);

  return (
    <>
      <AdminTopbar
        title="Services"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/content/services/new" className={newLinkClass}>
            + New service
          </Link>
        }
      />
      <AdminDataTable
        caption="Services"
        captionId="services-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No services yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/content/services/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteServiceAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
