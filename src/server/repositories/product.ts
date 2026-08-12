import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

/** One product as the Product Card renders it (DESIGN.md § Components). */
export interface ProductCardItem {
  id: string;
  slug: string;
  /** The machine model designation, e.g. `FD-9500`. Rendered in the `data` font. */
  model: string;
  name: string;
  isFallback: boolean;
  manufacturer: { slug: string; name: string };
  /** At most two label/value rows, already derived from the JSONB attributes. */
  specs: readonly { label: string; value: string }[];
}

/** How many spec rows the card shows — EXPERIENCE.md § Component Patterns: "two spec lines". */
const CARD_SPEC_ROWS = 2;

/**
 * `attributes` is content-defined JSONB, so this must survive anything: a null, an
 * array, a nested object, a number. Only string/number leaves become rows; every
 * other value is skipped rather than stringified into `[object Object]`.
 *
 * Keys are machine data and carry no translation model (EXPERIENCE.md § Foundation:
 * "machine data is language-neutral"), so they are humanized rather than looked up
 * in `messages/` — inventing message keys for content-defined columns would mean a
 * CI failure every time an admin adds an attribute.
 *
 * KEYS ARE SORTED, and that is not cosmetic. Postgres `jsonb` does NOT preserve key
 * insertion order (it orders by key length, then bytewise), so "the first two
 * attributes" would otherwise be decided by storage internals — measured: a row
 * written as `{detection, response, enclosure}` reads back as `{response, detection,
 * enclosure}`. Sorting here makes the choice OURS and identical whatever the
 * attributes came from.
 *
 * KNOWN LIMITATION, deliberately not solved here: there is no "featured spec"
 * concept in the schema, so an editor cannot choose WHICH two rows the card shows.
 * Any rule is arbitrary; this one is at least deterministic and explainable.
 */
export function toSpecRows(
  attributes: unknown,
  max: number = CARD_SPEC_ROWS,
): { label: string; value: string }[] {
  if (typeof attributes !== "object" || attributes === null || Array.isArray(attributes)) return [];

  const rows: { label: string; value: string }[] = [];
  const entries = Object.entries(attributes as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  for (const [key, value] of entries) {
    if (rows.length >= max) break;
    if (typeof value !== "string" && typeof value !== "number") continue;
    rows.push({ label: humanizeSpecKey(key), value: String(value) });
  }
  return rows;
}

/** `hazArea` → `Haz area`. Splits camelCase; leaves already-spaced keys alone. */
export function humanizeSpecKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const trimmed = spaced.trim();
  if (!trimmed) return key;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

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
  // Tagged `catalog` only. The convention's per-entity tag is `product:{id}`, but
  // the id is not known until AFTER this query runs, and `unstable_cache` tags are
  // fixed when the wrapper is built. A slug→id mapping arrives with the product
  // detail page (Epic 2) and the admin mutations that would emit `product:{id}`
  // (Epic 4); until then `catalog` is the honest invalidation granularity here.
  return cached(() => queryProductBySlug(slug, locale), ["product", slug, locale], [TAGS.catalog]);
}

/**
 * Published products supplied into `industrySlug`, for the Featured-products block
 * (Story 2.1).
 *
 * `status: "published"` is NOT optional. The column defaults to `draft`, so an
 * unfiltered read publishes work-in-progress catalogue entries — the architecture's
 * rule is that unpublished items are never enumerable.
 *
 * Ordering is by slug so the "featured" set is deterministic: there is no
 * `featured` column, and an unordered `take` would return a different four products
 * between requests, which would also make the page uncacheable in any useful sense.
 */
export async function listProductsByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<ProductCardItem[]> {
  return cached(
    () => queryProductsByIndustry(industrySlug, locale, limit),
    ["products-by-industry", industrySlug, locale, String(limit ?? "all")],
    [TAGS.catalog, TAGS.industry(industrySlug)],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryProductsByIndustry(
  industrySlug: string,
  locale: Locale,
  limit?: number,
): Promise<ProductCardItem[]> {
  const products = await prisma.product.findMany({
    where: {
      status: "published",
      industries: { some: { industry: { slug: industrySlug } } },
    },
    include: { translations: true, manufacturer: { include: { translations: true } } },
    orderBy: { slug: "asc" },
    take: limit,
  });

  return products.map((product) => {
    const t = resolveTranslation(product.translations, locale);
    const mt = resolveTranslation(product.manufacturer.translations, locale);
    return {
      id: product.id,
      slug: product.slug,
      model: product.model,
      name: t?.value.name ?? product.model,
      isFallback: t?.isFallback ?? false,
      manufacturer: {
        slug: product.manufacturer.slug,
        name: mt?.value.name ?? product.manufacturer.slug,
      },
      specs: toSpecRows(product.attributes),
    };
  });
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryProductBySlug(
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
