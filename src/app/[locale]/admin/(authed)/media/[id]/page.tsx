import { notFound } from "next/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { MediaAssetForm } from "@/components/admin/media/MediaAssetForm";
import { getMediaAssetForEdit } from "@/server/repositories/media";

export default async function EditMediaAssetPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const initial = await getMediaAssetForEdit(id);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit media" subtitle="Media · alt text" />
      <MediaAssetForm initial={initial} />
    </>
  );
}
