import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ProductForm } from "@/components/admin/catalog/ProductForm";
import { getProductForEdit } from "@/server/repositories/product";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listCategoryOptions } from "@/server/repositories/category";
import { listSeriesAdminOptions } from "@/server/repositories/series";
import { listMediaAssetOptions } from "@/server/repositories/media";

export default async function EditProductPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, manufacturers, categories, series, mediaOptions] = await Promise.all([
    getProductForEdit(id),
    listManufacturers(locale),
    listCategoryOptions(locale),
    listSeriesAdminOptions(locale),
    listMediaAssetOptions(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit product" subtitle={`Catalog · ${initial.slug}`} />
      <ProductForm
        mode="edit"
        initial={initial}
        manufacturerOptions={manufacturers.map((m) => ({ id: m.id, name: m.name }))}
        categoryOptions={categories.map((c) => ({ id: c.id, name: c.name }))}
        seriesOptions={series.map((s) => ({
          id: s.id,
          name: s.name,
          manufacturerId: s.manufacturerId,
        }))}
        mediaOptions={mediaOptions}
      />
    </>
  );
}
