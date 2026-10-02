import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { GuideForm } from "@/components/admin/guides/GuideForm";
import { getGuideForEdit } from "@/server/repositories/selection-guide";
import { listProductsForAdmin } from "@/server/repositories/product";
import { listCategoryOptions } from "@/server/repositories/category";

export default async function EditGuidePage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [guide, products, categories] = await Promise.all([
    getGuideForEdit(id),
    listProductsForAdmin(locale),
    listCategoryOptions(locale),
  ]);
  if (!guide) notFound();
  return (
    <>
      <AdminTopbar title="Edit selection guide" subtitle={`Content · Guides · ${guide.slug}`} />
      <GuideForm
        mode="edit"
        initial={guide}
        productOptions={products.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
        categoryOptions={categories}
      />
    </>
  );
}
