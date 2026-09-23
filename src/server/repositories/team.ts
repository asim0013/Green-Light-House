import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

/**
 * Team members (Story 4.4b) — admin writes only. There is NO public reader yet:
 * the public Team page is deferred to Epic 5 (no route exists). Model + admin
 * editor land here so content can be entered ahead of the public surface.
 */

export interface TeamTranslationWrite {
  locale: Locale;
  name: string;
  role: string | null;
  bio: string | null;
}

export interface TeamMemberRow {
  id: string;
  name: string;
  order: number;
}

export interface TeamMemberEditData {
  id: string;
  order: number;
  translations: { locale: Locale; name: string; role: string | null; bio: string | null }[];
}

/** All team members for the admin list (EN-fallback name), ordered. */
export async function listTeamMembers(locale: Locale): Promise<TeamMemberRow[]> {
  const rows = await prisma.teamMember.findMany({
    include: { translations: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((m) => ({
    id: m.id,
    order: m.order,
    name: resolveTranslation(m.translations, locale)?.value.name ?? "(unnamed)",
  }));
}

export async function getTeamMemberForEdit(id: string): Promise<TeamMemberEditData | null> {
  const row = await prisma.teamMember.findUnique({
    where: { id },
    include: { translations: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    order: row.order,
    translations: row.translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      role: t.role,
      bio: t.bio,
    })),
  };
}

export async function createTeamMember(data: {
  order: number;
  translations: TeamTranslationWrite[];
}): Promise<{ id: string }> {
  const created = await prisma.teamMember.create({
    data: {
      order: data.order,
      translations: {
        create: data.translations.map((t) => ({
          locale: t.locale,
          name: t.name,
          role: t.role,
          bio: t.bio,
        })),
      },
    },
    select: { id: true },
  });
  return created;
}

/** Update a member's order + replace translations (photoKey untouched — Story 4.5). Returns false if absent. */
export async function updateTeamMember(
  id: string,
  order: number,
  translations: TeamTranslationWrite[],
): Promise<boolean> {
  const exists = await prisma.teamMember.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.teamMember.update({ where: { id }, data: { order } }),
    prisma.teamMemberTranslation.deleteMany({ where: { memberId: id } }),
    prisma.teamMemberTranslation.createMany({
      data: translations.map((t) => ({
        memberId: id,
        locale: t.locale,
        name: t.name,
        role: t.role,
        bio: t.bio,
      })),
    }),
  ]);
  return true;
}

/** Delete a team member (translations cascade). No external references. */
export async function deleteTeamMember(id: string): Promise<void> {
  await prisma.teamMember.delete({ where: { id } });
}
