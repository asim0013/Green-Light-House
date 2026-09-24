import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { DocumentForm } from "@/components/admin/documents/DocumentForm";
import { ReplaceFileControl } from "@/components/admin/documents/ReplaceFileControl";
import { getDocumentForEdit } from "@/server/repositories/document";
import { listProductsForAdmin } from "@/server/repositories/product";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listIndustryOptions } from "@/server/repositories/industry";

export default async function EditDocumentPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, products, manufacturers, industries] = await Promise.all([
    getDocumentForEdit(id),
    listProductsForAdmin(locale),
    listManufacturers(locale),
    listIndustryOptions(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit document" subtitle={`Documents · ${initial.slug}`} />
      <DocumentForm
        mode="edit"
        initial={initial}
        productOptions={products.map((p) => ({ id: p.id, name: p.name }))}
        manufacturerOptions={manufacturers.map((m) => ({ id: m.id, name: m.name }))}
        industryOptions={industries.map((i) => ({ id: i.id, name: i.name }))}
      />
      <ReplaceFileControl
        id={initial.id}
        downloadHref={initial.downloadHref}
        version={initial.version}
      />
    </>
  );
}
