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
  /**
   * `isFallback` is per-field: a product can be translated while its manufacturer
   * is not, and vice versa. Carrying the manufacturer's own flag is what lets the
   * card mark ONLY the string that actually fell back (FR34a / AC6). An earlier
   * version resolved this and threw the flag away, so a fallen-back OEM name
   * rendered with no `lang="en"` and no visible notice.
   */
  manufacturer: { slug: string; name: string; isFallback: boolean };
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
 * KEYS ARE SORTED BY CODE POINT, and that is not cosmetic. Postgres `jsonb` does NOT
 * preserve key insertion order (it orders by key length, then bytewise), so "the
 * first two attributes" would otherwise be decided by storage internals — measured:
 * a row written as `{detection, response, enclosure}` reads back as `{response,
 * detection, enclosure}`. Sorting here makes the choice OURS.
 *
 * It is a plain `<` comparison, NOT `localeCompare`. `localeCompare` without a
 * locale argument uses the runtime's default collation, and the result genuinely
 * varies: across en/tr/ru/sv/de-phonebk the same key set produced THREE different
 * orderings, and the default also differs from code-point order on case. Since this
 * output is written into a SHARED Redis cache, two servers with different ICU
 * defaults could disagree about which two rows a card shows — defeating the very
 * determinism the sort exists for.
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
    a < b ? -1 : a > b ? 1 : 0,
  );
  for (const [key, value] of entries) {
    if (rows.length >= max) break;
    // A card has only two slots, so a blank or non-finite value must not consume
    // one. `typeof` alone lets "", "   ", NaN and Infinity through — and the CSV
    // import named in Story 4.10 is exactly the source that produces empty cells.
    if (typeof value === "number") {
      if (!Number.isFinite(value)) continue;
    } else if (typeof value === "string") {
      if (value.trim() === "") continue;
    } else {
      continue;
    }
    rows.push({ label: humanizeSpecKey(key), value: String(value) });
  }
  return rows;
}

/**
 * `hazArea` → `Haz area`. Splits camelCase and treats `_`/`-` as word breaks.
 *
 * CAPITALISATION IS PRESERVED, not normalised. This is an industrial equipment
 * catalogue: `IP66`, `ATEX`, `IECEx`, `SIL2` and `DN` are the labels that carry the
 * meaning, and an earlier version lower-cased everything after the first character
 * — rendering `Ip66`, `Atex`, `Iecex` and `Sil2` on public product cards. So only a
 * fully-lower-case first word is capitalised; anything the author already cased is
 * left exactly as written.
 */
export function humanizeSpecKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  const trimmed = spaced.trim();
  if (!trimmed) return key;

  // An ACRONYM is any word carrying two or more capitals (`IP66`, `ATEX`, `IECEx`,
  // `SIL2`). Those are left exactly as authored. An ordinary word carries at most
  // one capital — which the camelCase split just introduced — so it is lower-cased
  // back down, keeping `hazArea` reading as "Haz area" rather than "Haz Area".
  const isAcronym = (word: string) => (word.match(/[A-Z]/g) ?? []).length >= 2;

  const words = trimmed.split(" ").map((word, index) => {
    if (isAcronym(word)) return word;
    const lowered = word.toLowerCase();
    return index === 0 ? lowered.charAt(0).toUpperCase() + lowered.slice(1) : lowered;
  });

  return words.join(" ");
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

/**
 * The minimum structural shape `toProductCardItem` consumes — narrower than
 * Prisma's row type so the mapper is unit-testable with plain objects, and shared
 * by every card-producing read so the three of them cannot drift on how a card
 * resolves (Story 2.2 extracted this from `queryProductsByIndustry`'s inline map).
 */
export interface ProductCardRow {
  id: string;
  slug: string;
  model: string;
  attributes: unknown;
  translations: readonly { locale: Locale; name: string; description: string | null }[];
  manufacturer: {
    slug: string;
    translations: readonly { locale: Locale; name: string; description: string | null }[];
  };
}

/** Resolve one product row into the card shape for `locale` (EN fallback, FR34a). */
export function toProductCardItem(product: ProductCardRow, locale: Locale): ProductCardItem {
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
      // Resolved INDEPENDENTLY of the product's own flag — see ProductCardItem.
      isFallback: mt?.isFallback ?? false,
    },
    specs: toSpecRows(product.attributes),
  };
}

/** The Prisma `include` every card-producing read uses. */
const CARD_INCLUDE = {
  translations: true,
  manufacturer: { include: { translations: true } },
} as const;

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
    include: CARD_INCLUDE,
    orderBy: { slug: "asc" },
    take: limit,
  });

  return products.map((product) => toProductCardItem(product, locale));
}

/**
 * The catalog cap (Story 2.2). There is no pagination anywhere in the planning
 * documents — the architecture defers it entirely — so the unfiltered grid takes an
 * explicit ceiling instead of an unbounded read. 60 is far above the seeded 5 and
 * far below anything that would hurt; revisit when the bulk-import ramp (FR6)
 * makes the catalog big enough to page.
 */
export const CATALOG_PRODUCT_CAP = 60;

/**
 * Every published product, for the unfiltered `/products` grid (Story 2.2).
 * Published-only for the same non-negotiable reason as the industry read.
 */
export async function listPublishedProducts(
  locale: Locale,
  limit: number = CATALOG_PRODUCT_CAP,
): Promise<ProductCardItem[]> {
  return cached(
    () => queryPublishedProducts(locale, limit),
    ["products-all", locale, String(limit)],
    [TAGS.catalog],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryPublishedProducts(
  locale: Locale,
  limit: number = CATALOG_PRODUCT_CAP,
): Promise<ProductCardItem[]> {
  const products = await prisma.product.findMany({
    where: { status: "published" },
    include: CARD_INCLUDE,
    orderBy: { slug: "asc" },
    take: limit,
  });

  return products.map((product) => toProductCardItem(product, locale));
}

/**
 * Published products directly attached to `categorySlug` (Story 2.2).
 *
 * DIRECT attachment only — `Product.categoryId` is a single FK, and the Task 0
 * decision is NO roll-up of child-category products into a parent's view: the
 * parent page shows its child tiles and its own products, so counts never lie.
 * (Measured: `gd-410` sits directly on the parent `fire-gas-detection`, proving
 * direct attachment is a real case, not an anomaly.)
 */
export async function listProductsByCategory(
  categorySlug: string,
  locale: Locale,
  limit: number = CATALOG_PRODUCT_CAP,
): Promise<ProductCardItem[]> {
  return cached(
    () => queryProductsByCategory(categorySlug, locale, limit),
    ["products-by-category", categorySlug, locale, String(limit)],
    [TAGS.catalog, TAGS.categories],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryProductsByCategory(
  categorySlug: string,
  locale: Locale,
  limit: number = CATALOG_PRODUCT_CAP,
): Promise<ProductCardItem[]> {
  const products = await prisma.product.findMany({
    where: { status: "published", category: { slug: categorySlug } },
    include: CARD_INCLUDE,
    orderBy: { slug: "asc" },
    take: limit,
  });

  return products.map((product) => toProductCardItem(product, locale));
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
