import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { IndustryForm } from "@/components/admin/content/IndustryForm";

export default function NewIndustryPage() {
  return (
    <>
      <AdminTopbar title="New industry" subtitle="Content · Industries" />
      <IndustryForm mode="create" />
    </>
  );
}
