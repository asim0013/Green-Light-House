import { notFound } from "next/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { IndustryForm } from "@/components/admin/content/IndustryForm";
import { getIndustryForEdit } from "@/server/repositories/industry";

export default async function EditIndustryPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const initial = await getIndustryForEdit(id);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit industry" subtitle={`Content · ${initial.slug}`} />
      <IndustryForm mode="edit" initial={initial} />
    </>
  );
}
