import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ManufacturerForm } from "@/components/admin/catalog/ManufacturerForm";
import { listMediaAssetOptions } from "@/server/repositories/media";

export default async function NewManufacturerPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const mediaOptions = await listMediaAssetOptions(locale);
  return (
    <>
      <AdminTopbar title="New manufacturer" subtitle="Catalog · Manufacturers" />
      <ManufacturerForm mode="create" mediaOptions={mediaOptions} />
    </>
  );
}
