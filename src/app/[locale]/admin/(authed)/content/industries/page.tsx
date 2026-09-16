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
import { listIndustryOptions } from "@/server/repositories/industry";
import { deleteIndustryAction } from "@/server/admin/content/industry-actions";

export default async function IndustriesListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listIndustryOptions(locale);

  return (
    <>
      <AdminTopbar
        title="Industries"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/content/industries/new" className={newLinkClass}>
            + New industry
          </Link>
        }
      />
      <AdminDataTable
        caption="Industries"
        captionId="industries-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No industries yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/content/industries/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteIndustryAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
