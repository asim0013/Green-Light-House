import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { ProjectForm } from "@/components/admin/content/ProjectForm";
import { listIndustryOptions } from "@/server/repositories/industry";

export default async function NewProjectPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const industries = await listIndustryOptions(locale);

  return (
    <>
      <AdminTopbar title="New project" subtitle="Content · Projects" />
      <ProjectForm
        mode="create"
        industryOptions={industries.map((i) => ({ id: i.id, name: i.name }))}
      />
    </>
  );
}
