import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { HomeContentForm } from "@/components/admin/content/HomeContentForm";
import { getHomeContentForEdit } from "@/server/repositories/home-content";

export default async function HomepageEditorPage() {
  const initial = await getHomeContentForEdit();
  return (
    <>
      <AdminTopbar title="Homepage" subtitle="Content · Homepage editorial copy" />
      <HomeContentForm initial={initial} />
    </>
  );
}
