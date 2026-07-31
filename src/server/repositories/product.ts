import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

export interface ProductDetail {
  id: string;
  model: string;
  slug: string;
  name: string;
  description: string | null;
  isFallback: boolean;
  manufacturer: { slug: string; name: string };
  category: { slug: string; name: string };
  /** Technical spec key/values (JSONB); shape is content-defined. */
  attributes: unknown;
}

/**
 * Fetch a single product by slug with all human-readable fields resolved for
 * `locale` (EN fallback). Returns null when the product doesn't exist.
 */
export async function getProductBySlug(
  slug: string,
  locale: Locale,
): Promise<ProductDetail | null> {
  const product = await prisma.product.findUnique({
    where: { slug },
    include: {
      translations: true,
      manufacturer: { include: { translations: true } },
      category: { include: { translations: true } },
    },
  });
  if (!product) return null;

  const t = resolveTranslation(product.translations, locale);
  const mt = resolveTranslation(product.manufacturer.translations, locale);
  const ct = resolveTranslation(product.category.translations, locale);

  return {
    id: product.id,
    model: product.model,
    slug: product.slug,
    name: t?.value.name ?? product.model,
    description: t?.value.description ?? null,
    isFallback: t?.isFallback ?? false,
    manufacturer: {
      slug: product.manufacturer.slug,
      name: mt?.value.name ?? product.manufacturer.slug,
    },
    category: {
      slug: product.category.slug,
      name: ct?.value.name ?? product.category.slug,
    },
    attributes: product.attributes,
  };
}
