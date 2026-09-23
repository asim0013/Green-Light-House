import type { Locale } from "@prisma/client";
import { cache } from "react";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";
import { HOME_CONTENT_KEY } from "../../../scripts/home-fixtures";

/**
 * Homepage editorial content (Story 4.4b) — the singleton on the `getSlaContent`
 * idiom. Returns the copy resolved for `locale` (EN fallback) + the
 * locale-invariant cert marks, or `null` when the row is absent. Callers MUST
 * handle null: the homepage falls back to the `messages` `Home` namespace field
 * by field (`content?.x ?? t("x")`), so an unseeded model renders today's copy.
 */

/** The editable homepage strings (each nullable — EN fallback + messages fallback). */
export interface HomeContentValues {
  kicker: string | null;
  title: string | null;
  lead: string | null;
  noPrices: string | null;
  credibilityTitle: string | null;
  capability: string | null;
  ctaTitle: string | null;
  industriesTitle: string | null;
  industriesSub: string | null;
  categoriesTitle: string | null;
  manufacturersTitle: string | null;
}

export interface HomeContent extends HomeContentValues {
  certMarks: string[];
  /** True when the copy fell back to EN. */
  isFallback: boolean;
}

const FIELDS: (keyof HomeContentValues)[] = [
  "kicker",
  "title",
  "lead",
  "noPrices",
  "credibilityTitle",
  "capability",
  "ctaTitle",
  "industriesTitle",
  "industriesSub",
  "categoriesTitle",
  "manufacturersTitle",
];

function certMarksOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Cached homepage content read (React-cached for within-request dedup, tagged `home`). */
export const getHomeContent = cache(async (locale: Locale): Promise<HomeContent | null> =>
  cached(() => queryHomeContent(locale), ["home-content", locale], [TAGS.home]),
);

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryHomeContent(locale: Locale): Promise<HomeContent | null> {
  const row = await prisma.homeContent.findUnique({
    where: { key: HOME_CONTENT_KEY },
    include: { translations: true },
  });
  if (!row) return null;
  const t = resolveTranslation(row.translations, locale);
  const values = {} as HomeContentValues;
  for (const field of FIELDS)
    values[field] = (t?.value[field] as string | null | undefined) ?? null;
  return { ...values, certMarks: certMarksOf(row.certMarks), isFallback: t?.isFallback ?? false };
}

// ---- Admin edit (Story 4.4b) ----------------------------------------------

export interface HomeContentEditData {
  certMarks: string[];
  translations: ({ locale: Locale } & HomeContentValues)[];
}

/** Load the singleton's raw per-locale copy + cert marks for the admin editor. */
export async function getHomeContentForEdit(): Promise<HomeContentEditData> {
  const row = await prisma.homeContent.findUnique({
    where: { key: HOME_CONTENT_KEY },
    include: { translations: true },
  });
  return {
    certMarks: certMarksOf(row?.certMarks),
    translations: (row?.translations ?? []).map((tr) => {
      const values = {} as HomeContentValues;
      for (const field of FIELDS) values[field] = tr[field] ?? null;
      return { locale: tr.locale, ...values };
    }),
  };
}

/** Replace the singleton's cert marks + translations. Upsert-in-place (there is one row). */
export async function updateHomeContent(data: {
  certMarks: string[];
  translations: ({ locale: Locale } & Partial<HomeContentValues>)[];
}): Promise<void> {
  const home = await prisma.homeContent.upsert({
    where: { key: HOME_CONTENT_KEY },
    update: { certMarks: data.certMarks },
    create: { key: HOME_CONTENT_KEY, certMarks: data.certMarks },
  });
  await prisma.$transaction([
    prisma.homeContentTranslation.deleteMany({ where: { homeContentId: home.id } }),
    prisma.homeContentTranslation.createMany({
      data: data.translations.map((tr) => ({ homeContentId: home.id, ...tr })),
    }),
  ]);
}
