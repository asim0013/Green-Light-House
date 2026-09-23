import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ManufacturerForm } from "@/components/admin/catalog/ManufacturerForm";
import { getManufacturerForEdit } from "@/server/repositories/manufacturer";
import { listMediaAssetOptions } from "@/server/repositories/media";

export default async function EditManufacturerPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, mediaOptions] = await Promise.all([
    getManufacturerForEdit(id),
    listMediaAssetOptions(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit manufacturer" subtitle={`Catalog · ${initial.slug}`} />
      <ManufacturerForm mode="edit" initial={initial} mediaOptions={mediaOptions} />
    </>
  );
}
