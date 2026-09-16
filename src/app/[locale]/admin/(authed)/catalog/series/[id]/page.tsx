import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { SeriesForm } from "@/components/admin/catalog/SeriesForm";
import { getSeriesForEdit } from "@/server/repositories/series";
import { listManufacturers } from "@/server/repositories/manufacturer";

export default async function EditSeriesPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, manufacturers] = await Promise.all([
    getSeriesForEdit(id),
    listManufacturers(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit series" subtitle={`Catalog · ${initial.slug}`} />
      <SeriesForm
        mode="edit"
        initial={initial}
        manufacturerOptions={manufacturers.map((m) => ({ id: m.id, name: m.name }))}
      />
    </>
  );
}
