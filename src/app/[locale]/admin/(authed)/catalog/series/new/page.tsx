import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { SeriesForm } from "@/components/admin/catalog/SeriesForm";
import { listManufacturers } from "@/server/repositories/manufacturer";

export default async function NewSeriesPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const manufacturers = await listManufacturers(locale);

  return (
    <>
      <AdminTopbar title="New series" subtitle="Catalog · Series" />
      <SeriesForm
        mode="create"
        manufacturerOptions={manufacturers.map((m) => ({ id: m.id, name: m.name }))}
      />
    </>
  );
}
