import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { GuideForm } from "@/components/admin/guides/GuideForm";
import { listProductsForAdmin } from "@/server/repositories/product";
import { listCategoryOptions } from "@/server/repositories/category";

export default async function NewGuidePage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [products, categories] = await Promise.all([
    listProductsForAdmin(locale),
    listCategoryOptions(locale),
  ]);
  return (
    <>
      <AdminTopbar title="New selection guide" subtitle="Content · Guides" />
      <GuideForm
        mode="create"
        productOptions={products.map((p) => ({ id: p.id, slug: p.slug, name: p.name }))}
        categoryOptions={categories}
      />
    </>
  );
}
