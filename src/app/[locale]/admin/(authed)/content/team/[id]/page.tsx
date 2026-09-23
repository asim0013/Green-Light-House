import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { AdminTopbar } from "@/components/admin/AdminTopbar";
import { TeamForm } from "@/components/admin/content/TeamForm";
import { getTeamMemberForEdit } from "@/server/repositories/team";
import { listMediaAssetOptions } from "@/server/repositories/media";

export default async function EditTeamMemberPage(props: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await props.params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [initial, mediaOptions] = await Promise.all([
    getTeamMemberForEdit(id),
    listMediaAssetOptions(locale),
  ]);
  if (!initial) notFound();

  return (
    <>
      <AdminTopbar title="Edit team member" subtitle="Content · Team" />
      <TeamForm mode="edit" initial={initial} mediaOptions={mediaOptions} />
    </>
  );
}
