import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface CategoryListItem {
  id: string;
  slug: string;
  name: string;
  /** True when the name fell back to EN. */
  isFallback: boolean;
}

/**
 * List TOP-LEVEL categories only (`parent_id IS NULL`), resolved for `locale`.
 *
 * Categories are self-referencing and hierarchical: the seed's `flame-detectors`
 * is a child of `fire-gas-detection`, so an unfiltered read would list a child
 * alongside its own parent as a peer signpost. Child browse is Epic 2's job.
 */
export async function listTopLevelCategories(locale: Locale): Promise<CategoryListItem[]> {
  const categories = await prisma.category.findMany({
    where: { parentId: null },
    include: { translations: true },
    orderBy: { slug: "asc" },
  });

  return categories.map((category) => {
    const t = resolveTranslation(category.translations, locale);
    return {
      id: category.id,
      slug: category.slug,
      name: t?.value.name ?? category.slug,
      isFallback: t?.isFallback ?? false,
    };
  });
}
