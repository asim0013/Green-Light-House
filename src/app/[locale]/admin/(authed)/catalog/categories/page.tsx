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
import { listCategoryOptions } from "@/server/repositories/category";
import { deleteCategoryAction } from "@/server/admin/catalog/category-actions";

export default async function CategoriesListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listCategoryOptions(locale);

  return (
    <>
      <AdminTopbar
        title="Categories"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/catalog/categories/new" className={newLinkClass}>
            + New category
          </Link>
        }
      />
      <AdminDataTable
        caption="Categories"
        captionId="categories-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No categories yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          { header: "Slug", cell: (r) => <span className="font-data">{r.slug}</span> },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/catalog/categories/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteCategoryAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
