import { notFound } from "next/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ManufacturerForm } from "@/components/admin/catalog/ManufacturerForm";
import { getManufacturerForEdit } from "@/server/repositories/manufacturer";

export default async function EditManufacturerPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const initial = await getManufacturerForEdit(id);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit manufacturer" subtitle={`Catalog · ${initial.slug}`} />
      <ManufacturerForm mode="edit" initial={initial} />
    </>
  );
}
