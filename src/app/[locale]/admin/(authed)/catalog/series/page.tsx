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
import { listSeriesAdminOptions } from "@/server/repositories/series";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { deleteSeriesAction } from "@/server/admin/catalog/series-actions";

export default async function SeriesListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [rows, manufacturers] = await Promise.all([
    listSeriesAdminOptions(locale),
    listManufacturers(locale),
  ]);
  const manufacturerName = new Map(manufacturers.map((m) => [m.id, m.name]));

  return (
    <>
      <AdminTopbar
        title="Series"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/catalog/series/new" className={newLinkClass}>
            + New series
          </Link>
        }
      />
      <AdminDataTable
        caption="Series"
        captionId="series-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No series yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          { header: "Manufacturer", cell: (r) => manufacturerName.get(r.manufacturerId) ?? "—" },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/catalog/series/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteSeriesAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
