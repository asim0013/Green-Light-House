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
import { listProductsForAdmin } from "@/server/repositories/product";
import { deleteProductAction } from "@/server/admin/catalog/product-actions";

export default async function ProductsListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listProductsForAdmin(locale);

  return (
    <>
      <AdminTopbar
        title="Products"
        subtitle={`${rows.length} total`}
        actions={
          <Link href="/admin/catalog/products/new" className={newLinkClass}>
            + New product
          </Link>
        }
      />
      <AdminDataTable
        caption="Products"
        captionId="products-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No products yet. Create the first one."
        columns={[
          { header: "Name", rowHeader: true, cell: (r) => r.name },
          { header: "Model", cell: (r) => <span className="font-data">{r.model}</span> },
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
                <Link href={`/admin/catalog/products/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteProductAction} id={r.id} label={r.name} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
