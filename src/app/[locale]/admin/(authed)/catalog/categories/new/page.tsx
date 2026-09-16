import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { CategoryForm } from "@/components/admin/catalog/CategoryForm";
import { listCategoryOptions } from "@/server/repositories/category";

export default async function NewCategoryPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const parentOptions = await listCategoryOptions(locale);

  return (
    <>
      <AdminTopbar title="New category" subtitle="Catalog · Categories" />
      <CategoryForm
        mode="create"
        parentOptions={parentOptions.map((c) => ({ id: c.id, name: c.name }))}
      />
    </>
  );
}
