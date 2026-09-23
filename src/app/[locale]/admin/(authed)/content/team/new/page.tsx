import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { TeamForm } from "@/components/admin/content/TeamForm";

export default function NewTeamMemberPage() {
  return (
    <>
      <AdminTopbar title="New team member" subtitle="Content · Team" />
      <TeamForm mode="create" />
    </>
  );
}
