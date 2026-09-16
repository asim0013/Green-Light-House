import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ProductForm } from "@/components/admin/catalog/ProductForm";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listCategoryOptions } from "@/server/repositories/category";
import { listSeriesAdminOptions } from "@/server/repositories/series";

export default async function NewProductPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [manufacturers, categories, series] = await Promise.all([
    listManufacturers(locale),
    listCategoryOptions(locale),
    listSeriesAdminOptions(locale),
  ]);

  return (
    <>
      <AdminTopbar title="New product" subtitle="Catalog · Products" />
      <ProductForm
        mode="create"
        manufacturerOptions={manufacturers.map((m) => ({ id: m.id, name: m.name }))}
        categoryOptions={categories.map((c) => ({ id: c.id, name: c.name }))}
        seriesOptions={series.map((s) => ({
          id: s.id,
          name: s.name,
          manufacturerId: s.manufacturerId,
        }))}
      />
    </>
  );
}
