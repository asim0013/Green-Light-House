import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { CategoryForm } from "@/components/admin/catalog/CategoryForm";
import { getCategoryForEdit, listCategoryOptions } from "@/server/repositories/category";

export default async function EditCategoryPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, parentOptions] = await Promise.all([
    getCategoryForEdit(id),
    listCategoryOptions(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit category" subtitle={`Catalog · ${initial.slug}`} />
      <CategoryForm
        mode="edit"
        initial={initial}
        parentOptions={parentOptions.map((c) => ({ id: c.id, name: c.name }))}
      />
    </>
  );
}
