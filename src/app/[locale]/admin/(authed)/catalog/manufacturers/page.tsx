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
import { listManufacturers } from "@/server/repositories/manufacturer";
import { deleteManufacturerAction } from "@/server/admin/catalog/manufacturer-actions";

export default async function ManufacturersListPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listManufacturers(locale);

  return (
    <>
      <AdminTopbar
        title="Manufacturers"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/catalog/manufacturers/new" className={newLinkClass}>
            + New manufacturer
          </Link>
        }
      />
      <AdminDataTable
        caption="Manufacturers"
        captionId="manufacturers-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No manufacturers yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/catalog/manufacturers/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteManufacturerAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
