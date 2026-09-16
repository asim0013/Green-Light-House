import { notFound } from "next/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ServiceForm } from "@/components/admin/content/ServiceForm";
import { getServiceForEdit } from "@/server/repositories/service";

export default async function EditServicePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const initial = await getServiceForEdit(id);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit service" subtitle={`Content · ${initial.slug}`} />
      <ServiceForm mode="edit" initial={initial} />
    </>
  );
}
