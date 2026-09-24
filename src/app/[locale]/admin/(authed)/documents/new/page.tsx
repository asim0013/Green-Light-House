import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { DocumentForm } from "@/components/admin/documents/DocumentForm";
import { listProductsForAdmin } from "@/server/repositories/product";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listIndustryOptions } from "@/server/repositories/industry";

export default async function NewDocumentPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [products, manufacturers, industries] = await Promise.all([
    listProductsForAdmin(locale),
    listManufacturers(locale),
    listIndustryOptions(locale),
  ]);

  return (
    <>
      <AdminTopbar title="New document" subtitle="Documents · certificate / datasheet / catalog" />
      <DocumentForm
        mode="create"
        productOptions={products.map((p) => ({ id: p.id, name: p.name }))}
        manufacturerOptions={manufacturers.map((m) => ({ id: m.id, name: m.name }))}
        industryOptions={industries.map((i) => ({ id: i.id, name: i.name }))}
      />
    </>
  );
}
