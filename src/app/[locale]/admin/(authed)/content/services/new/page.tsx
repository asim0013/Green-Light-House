import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ServiceForm } from "@/components/admin/content/ServiceForm";

export default function NewServicePage() {
  return (
    <>
      <AdminTopbar title="New service" subtitle="Content · Services" />
      <ServiceForm mode="create" />
    </>
  );
}
