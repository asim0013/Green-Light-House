import { notFound } from "next/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { TeamForm } from "@/components/admin/content/TeamForm";
import { getTeamMemberForEdit } from "@/server/repositories/team";

export default async function EditTeamMemberPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const initial = await getTeamMemberForEdit(id);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit team member" subtitle="Content · Team" />
      <TeamForm mode="edit" initial={initial} />
    </>
  );
}
