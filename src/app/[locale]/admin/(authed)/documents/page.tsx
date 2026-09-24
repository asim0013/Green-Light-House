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
import { listDocumentsForAdmin } from "@/server/repositories/document";
import { deleteDocumentAction } from "@/server/admin/documents/actions";

/** Documents module (Story 4.6) — certificates, datasheets & catalogs. */
export default async function DocumentsListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listDocumentsForAdmin(locale);

  return (
    <>
      <AdminTopbar
        title="Documents"
        subtitle={`${rows.length} document(s) · ungated, versioned, stable links`}
        actions={
          <Link href="/admin/documents/new" className={newLinkClass}>
            + New document
          </Link>
        }
      />
      <AdminDataTable
        caption="Documents"
        captionId="documents-caption"
        rows={rows}
        getRowKey={(r) => r.id}
        empty="No documents yet. Upload the first certificate or datasheet."
        columns={[
          { header: "Title", rowHeader: true, cell: (r) => r.title },
          {
            header: "Type",
            cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.type}</span>,
          },
          {
            header: "Public",
            cell: (r) =>
              r.isPublic ? (
                <span className="text-[13px] text-ink-2">Public</span>
              ) : (
                <span className="text-[12px] text-[#B42318]">Private</span>
              ),
          },
          {
            header: "Version",
            align: "right",
            cell: (r) => <span className="font-data">v{r.version}</span>,
          },
          {
            header: "Actions",
            align: "right",
            cell: (r) => (
              <span className="inline-flex items-center gap-3">
                <Link href={`/admin/documents/${r.id}`} className={editLinkClass}>
                  Edit
                </Link>
                <DeleteButton action={deleteDocumentAction} id={r.id} label={r.title} />
              </span>
            ),
          },
        ]}
      />
    </>
  );
}
