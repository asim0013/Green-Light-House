import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { AdminDataTable, editLinkClass } from "@/components/admin/catalog/AdminDataTable";
import { DeleteButton } from "@/components/admin/catalog/DeleteButton";
import { MediaUploader } from "@/components/admin/media/MediaUploader";
import { listMediaAssets } from "@/server/repositories/media";
import { deleteMediaAssetAction } from "@/server/admin/media/actions";

/** Media library (Story 4.5) — upload + reuse images and videos across modules. */
export default async function MediaListPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const rows = await listMediaAssets(locale);

  return (
    <>
      <AdminTopbar
        title="Media"
        subtitle={`${rows.length} asset(s) · selectable across the content modules`}
      />
      <div className="flex flex-col gap-6 p-8">
        <MediaUploader />
        <AdminDataTable
          caption="Media assets"
          captionId="media-caption"
          rows={rows}
          getRowKey={(r) => r.id}
          empty="No media yet. Upload the first image or video."
          columns={[
            {
              header: "Preview",
              cell: (r) =>
                r.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- same-origin admin thumbnail
                  <img
                    src={r.href}
                    alt=""
                    className="h-12 w-12 rounded border border-border-subtle object-cover"
                  />
                ) : (
                  <span className="font-mono text-[11px] uppercase text-ink-2">video</span>
                ),
            },
            { header: "File", rowHeader: true, cell: (r) => r.originalName },
            {
              header: "Type",
              cell: (r) => <span className="font-mono text-[12px] text-ink-2">{r.mime}</span>,
            },
            {
              header: "Alt",
              cell: (r) =>
                r.alt ? (
                  <span className="text-[13px] text-ink-2">{r.alt}</span>
                ) : (
                  <span className="text-[12px] text-[#B42318]">— missing —</span>
                ),
            },
            {
              header: "Actions",
              align: "right",
              cell: (r) => (
                <span className="inline-flex items-center gap-3">
                  <Link href={`/admin/media/${r.id}`} className={editLinkClass}>
                    Edit
                  </Link>
                  <DeleteButton action={deleteMediaAssetAction} id={r.id} label={r.originalName} />
                </span>
              ),
            },
          ]}
        />
      </div>
    </>
  );
}
