import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ProjectForm } from "@/components/admin/content/ProjectForm";
import { getProjectForEdit } from "@/server/repositories/project";
import { listIndustryOptions } from "@/server/repositories/industry";

export default async function EditProjectPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, industries] = await Promise.all([
    getProjectForEdit(id),
    listIndustryOptions(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit project" subtitle={`Content · ${initial.slug}`} />
      <ProjectForm
        mode="edit"
        initial={initial}
        industryOptions={industries.map((i) => ({ id: i.id, name: i.name }))}
      />
    </>
  );
}
