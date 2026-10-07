import { cache } from "react";
import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

/**
 * Engineering selection guides (Story 4.11 — FR41/FR42/FR42a). An admin-authored
 * SEO content type: a guide with a rich intro, ordered sections, and curated
 * links to recommended products/categories (internal SEO links). Public readers
 * return PUBLISHED guides only (a draft is invisible publicly → the page
 * soft-404s, the sitemap omits it). Translations resolve with EN fallback
 * (FR34a); the admin reader returns raw all-locale rows for editing. Cached +
 * tagged `guides` so an admin edit goes live without a deploy.
 */

// ---- Public read shapes ----------------------------------------------------
export interface GuideListItem {
  slug: string;
  title: string;
  intro: string | null;
  /** Number of sections — lets the sitemap gate a guide without a full detail read. */
  sectionCount: number;
  isFallback: boolean;
}

export interface GuideSectionView {
  heading: string;
  body: string;
  isFallback: boolean;
}

/** A curated product/category link, resolved to a card. */
export interface GuideLinkView {
  slug: string;
  name: string;
  isFallback: boolean;
}

export interface GuideDetail {
  slug: string;
  title: string;
  intro: string | null;
  metaDescription: string | null;
  /** True when the guide's own title/intro fell back to EN (drives FR42a per-locale noindex). */
  isFallback: boolean;
  sections: GuideSectionView[];
  products: GuideLinkView[];
  categories: GuideLinkView[];
}

type NamedTranslation = { locale: Locale; name: string };

// ---- Public readers (published only, cached, tagged `guides`) ---------------
export async function queryPublishedGuides(locale: Locale): Promise<GuideListItem[]> {
  const rows = await prisma.selectionGuide.findMany({
    where: { status: "published" },
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      translations: { select: { locale: true, title: true, intro: true } },
      _count: { select: { sections: true } },
    },
  });
  const items: GuideListItem[] = [];
  for (const row of rows) {
    const t = resolveTranslation(row.translations, locale);
    if (!t) continue; // no EN and no requested-locale title → not renderable
    items.push({
      slug: row.slug,
      title: t.value.title,
      intro: t.value.intro,
      sectionCount: row._count.sections,
      isFallback: t.isFallback,
    });
  }
  return items;
}

export const listPublishedGuides = cache(async (locale: Locale): Promise<GuideListItem[]> =>
  cached(() => queryPublishedGuides(locale), ["guides-index", locale], [TAGS.guides]),
);

export async function queryGuideBySlug(slug: string, locale: Locale): Promise<GuideDetail | null> {
  const row = await prisma.selectionGuide.findFirst({
    where: { slug, status: "published" },
    select: {
      slug: true,
      translations: { select: { locale: true, title: true, intro: true, metaDescription: true } },
      sections: {
        orderBy: { sort: "asc" },
        select: { translations: { select: { locale: true, heading: true, body: true } } },
      },
      products: {
        orderBy: { sort: "asc" },
        select: {
          product: {
            select: { slug: true, translations: { select: { locale: true, name: true } } },
          },
        },
      },
      categories: {
        orderBy: { sort: "asc" },
        select: {
          category: {
            select: { slug: true, translations: { select: { locale: true, name: true } } },
          },
        },
      },
    },
  });
  if (!row) return null;
  const t = resolveTranslation(row.translations, locale);
  if (!t) return null; // neither requested locale nor EN → not renderable

  const sections: GuideSectionView[] = [];
  for (const s of row.sections) {
    const st = resolveTranslation(s.translations, locale);
    if (!st) continue; // a section with no resolvable text is dropped
    sections.push({ heading: st.value.heading, body: st.value.body, isFallback: st.isFallback });
  }

  const linkView = (link: {
    slug: string;
    translations: NamedTranslation[];
  }): GuideLinkView | null => {
    const r = resolveTranslation(link.translations, locale);
    return r ? { slug: link.slug, name: r.value.name, isFallback: r.isFallback } : null;
  };

  return {
    slug: row.slug,
    title: t.value.title,
    intro: t.value.intro,
    metaDescription: t.value.metaDescription,
    isFallback: t.isFallback,
    sections,
    products: row.products
      .map((p) => linkView(p.product))
      .filter((x): x is GuideLinkView => x !== null),
    categories: row.categories
      .map((c) => linkView(c.category))
      .filter((x): x is GuideLinkView => x !== null),
  };
}

export const getGuideBySlug = cache(
  async (slug: string, locale: Locale): Promise<GuideDetail | null> =>
    cached(() => queryGuideBySlug(slug, locale), ["guide", slug, locale], [TAGS.guides]),
);

// ---- Admin read (all statuses / all locales, raw) --------------------------
export interface AdminGuideRow {
  id: string;
  slug: string;
  status: "draft" | "published";
  title: string;
}

export async function listGuidesForAdmin(locale: Locale): Promise<AdminGuideRow[]> {
  const rows = await prisma.selectionGuide.findMany({
    orderBy: { slug: "asc" },
    select: {
      id: true,
      slug: true,
      status: true,
      translations: { select: { locale: true, title: true } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    status: row.status,
    title: resolveTranslation(row.translations, locale)?.value.title ?? row.slug,
  }));
}

export interface GuideEditData {
  id: string;
  slug: string;
  status: "draft" | "published";
  translations: {
    locale: Locale;
    title: string;
    intro: string | null;
    metaDescription: string | null;
  }[];
  sections: { sort: number; translations: { locale: Locale; heading: string; body: string }[] }[];
  productIds: string[];
  categoryIds: string[];
}

export async function getGuideForEdit(id: string): Promise<GuideEditData | null> {
  const row = await prisma.selectionGuide.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      status: true,
      translations: { select: { locale: true, title: true, intro: true, metaDescription: true } },
      sections: {
        orderBy: { sort: "asc" },
        select: {
          sort: true,
          translations: { select: { locale: true, heading: true, body: true } },
        },
      },
      products: { orderBy: { sort: "asc" }, select: { productId: true } },
      categories: { orderBy: { sort: "asc" }, select: { categoryId: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    status: row.status,
    translations: row.translations,
    sections: row.sections,
    productIds: row.products.map((p) => p.productId),
    categoryIds: row.categories.map((c) => c.categoryId),
  };
}

// ---- Writers (section + link replace = delete-then-create) -----------------
export interface GuideWriteData {
  status: "draft" | "published";
  translations: {
    locale: Locale;
    title: string;
    intro: string | null;
    metaDescription: string | null;
  }[];
  sections: { sort: number; translations: { locale: Locale; heading: string; body: string }[] }[];
  productIds: string[];
  categoryIds: string[];
}

function createNested(data: GuideWriteData) {
  return {
    status: data.status,
    translations: { create: data.translations },
    sections: {
      create: data.sections.map((s) => ({
        sort: s.sort,
        translations: { create: s.translations },
      })),
    },
    products: { create: data.productIds.map((productId, i) => ({ productId, sort: i })) },
    categories: { create: data.categoryIds.map((categoryId, i) => ({ categoryId, sort: i })) },
  };
}

export async function createGuide(
  slug: string,
  data: GuideWriteData,
): Promise<{ id: string; slug: string }> {
  return prisma.selectionGuide.create({
    data: { slug, ...createNested(data) },
    select: { id: true, slug: true },
  });
}

/** Replace a guide's translations/sections/links wholesale (slug immutable). */
export async function updateGuide(id: string, data: GuideWriteData): Promise<boolean> {
  const exists = await prisma.selectionGuide.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.selectionGuide.update({ where: { id }, data: { status: data.status } }),
    prisma.selectionGuideTranslation.deleteMany({ where: { guideId: id } }),
    prisma.selectionGuideTranslation.createMany({
      data: data.translations.map((t) => ({ guideId: id, ...t })),
    }),
    // Sections cascade their translations on delete; recreate with nested translations.
    prisma.selectionGuideSection.deleteMany({ where: { guideId: id } }),
    ...data.sections.map((s) =>
      prisma.selectionGuideSection.create({
        data: { guideId: id, sort: s.sort, translations: { create: s.translations } },
      }),
    ),
    prisma.selectionGuideProduct.deleteMany({ where: { guideId: id } }),
    prisma.selectionGuideProduct.createMany({
      data: data.productIds.map((productId, i) => ({ guideId: id, productId, sort: i })),
    }),
    prisma.selectionGuideCategory.deleteMany({ where: { guideId: id } }),
    prisma.selectionGuideCategory.createMany({
      data: data.categoryIds.map((categoryId, i) => ({ guideId: id, categoryId, sort: i })),
    }),
  ]);
  return true;
}

export async function deleteGuide(id: string): Promise<void> {
  await prisma.selectionGuide.delete({ where: { id } }); // sections/links/translations cascade
}
