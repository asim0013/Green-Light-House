import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { TeamForm } from "@/components/admin/content/TeamForm";
import { listMediaAssetOptions } from "@/server/repositories/media";

export default async function NewTeamMemberPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const mediaOptions = await listMediaAssetOptions(locale);
  return (
    <>
      <AdminTopbar title="New team member" subtitle="Content · Team" />
      <TeamForm mode="create" mediaOptions={mediaOptions} />
    </>
  );
}
