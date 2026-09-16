import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ManufacturerForm } from "@/components/admin/catalog/ManufacturerForm";

export default function NewManufacturerPage() {
  return (
    <>
      <AdminTopbar title="New manufacturer" subtitle="Catalog · Manufacturers" />
      <ManufacturerForm mode="create" />
    </>
  );
}
