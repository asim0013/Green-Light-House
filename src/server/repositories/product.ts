import { Prisma } from "@prisma/client";
import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";
import { isValidSlug } from "@/lib/slug";

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
  /**
   * The card footer's ungated download (Story 2.3) — the newest PUBLIC
   * datasheet-type document, or null (the footer renders only when real).
   * Newest `version` then slug is the deterministic pick; it binds 2.4's
   * Documents section (2.3 decision Q2).
   */
  datasheet: { slug: string; mime: string | null; sizeBytes: number | null } | null;
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
  /**
   * `isFallback` is per-field here for the same reason it is on the card: a
   * product can be translated while its manufacturer is not. The detail page
   * marks only the string that actually fell back (FR34a).
   */
  manufacturer: { slug: string; name: string; isFallback: boolean };
  category: { slug: string; name: string; isFallback: boolean };
  /** Technical spec key/values (JSONB); shape is content-defined. */
  attributes: unknown;
}

/** Uncached slug→id lookup for PUBLISHED products. */
async function queryProductId(slug: string): Promise<string | null> {
  const row = await prisma.product.findFirst({
    where: { slug, status: "published" },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * The id behind a PUBLISHED slug, or null. Cached and locale-independent.
 * Exists to give `getProductBySlug` its per-entity cache tag — see there.
 *
 * A CACHED NULL IS NEVER TRUSTED (2.4 review). This entry is tagged `catalog`
 * only — the per-entity tag cannot exist before the id is known — so a null
 * minted while a product was DRAFT survives the `product:{id}` purge an admin
 * emits on publish, and the page kept serving not-found. Measured: draft →
 * request (null cached) → publish → revalidate `product:{id}` → still not-found
 * until a `catalog` purge. So a cached miss falls through to one direct indexed
 * SELECT: publish transitions now take effect on the NEXT REQUEST with no purge
 * needed at all, and the only slugs paying the extra query are ones that do not
 * resolve. (The stored null entry still exists — the unbounded-cardinality item
 * stays deferred with `getCategoryBySlug`/`getDocumentBySlug` — it just cannot
 * poison a publish any more.)
 */
async function resolveProductId(slug: string): Promise<string | null> {
  const cachedId = await cached(() => queryProductId(slug), ["product-id", slug], [TAGS.catalog]);
  if (cachedId) return cachedId;
  return queryProductId(slug);
}

/**
 * Fetch a single product by slug with all human-readable fields resolved for
 * `locale` (EN fallback). Returns null when the product does not exist OR is not
 * published.
 *
 * IT CARRIES `product:{id}` (Story 2.4, closing a Story 1.8 defer). The
 * convention's per-entity tag needs the id, but `unstable_cache` fixes tags when
 * the wrapper is BUILT — so the id has to be known first, via `resolveProductId`;
 * the detail read is then keyed AND tagged by id. Both tags are applied:
 * `product:{id}` for a single product's purge, `catalog` so a catalogue-wide
 * invalidation still reaches detail pages.
 *
 * THE CACHED CLOSURE QUERIES BY THE SAME ID THE KEY CARRIES (2.4 review). The
 * first version keyed by id but queried by the CALLER'S SLUG — an input the key
 * did not distinguish, violating `cache.ts`'s own rule. Measured consequence:
 * after a slug rename plus a `product:{id}` purge, whichever slug was requested
 * first wrote ITS result into the shared id-keyed entry — a hit on the retired
 * slug cached `null` there, and the product's NEW canonical URL then served the
 * not-found body while the row sat published in the DB (and in the mirror order,
 * the dead slug served a full 200). Querying by id makes the entry's inputs
 * match its key, so no slug can poison another's read. The residual rename
 * behaviour — the RETIRED slug keeps rendering (canonical pointing at the new
 * URL) for up to the id-hop's TTL — is bounded, self-healing, and disclosed in
 * deferred-work.md.
 *
 * Cost: one extra cached lookup per render. A slug→id mapping is about as stable
 * as data gets, so in practice it is a permanent Redis hit. An unknown slug also
 * stops at the locale-independent id hop instead of minting one entry per locale.
 */
export async function getProductBySlug(
  slug: string,
  locale: Locale,
): Promise<ProductDetail | null> {
  const id = await resolveProductId(slug);
  if (!id) return null;

  return cached(
    () => queryProductById(id, locale),
    ["product", id, locale],
    [TAGS.product(id), TAGS.catalog],
  );
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
    [TAGS.catalog, TAGS.industry(industrySlug), TAGS.documents],
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
  /** The (already filtered+ordered) datasheet documents — CARD_INCLUDE takes 1. */
  documents?: readonly { slug: string; mime: string | null; sizeBytes: number | null }[];
}

/** Resolve one product row into the card shape for `locale` (EN fallback, FR34a). */
export function toProductCardItem(product: ProductCardRow, locale: Locale): ProductCardItem {
  const t = resolveTranslation(product.translations, locale);
  const mt = resolveTranslation(product.manufacturer.translations, locale);
  const datasheet = product.documents?.[0] ?? null;
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
    datasheet: datasheet
      ? { slug: datasheet.slug, mime: datasheet.mime, sizeBytes: datasheet.sizeBytes }
      : null,
  };
}

/**
 * The Prisma `include` every card-producing read uses. The documents relation is
 * FILTERED AND ORDERED IN THE QUERY (public datasheets, newest version first,
 * slug tiebreak, take 1) so the mapper's `[0]` pick is deterministic by
 * construction — no in-memory sorting to drift.
 */
export const CARD_INCLUDE = {
  translations: true,
  manufacturer: { include: { translations: true } },
  documents: {
    where: { type: "datasheet", isPublic: true },
    orderBy: [{ version: "desc" }, { slug: "asc" }],
    take: 1,
    select: { slug: true, mime: true, sizeBytes: true },
  },
} satisfies Prisma.ProductInclude;

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
    [TAGS.catalog, TAGS.documents],
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
    [TAGS.catalog, TAGS.categories, TAGS.documents],
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
  // `status: "published"` is NOT optional, and this read spent three stories
  // without it: it was a bare `findUnique({ where: { slug } })` with zero callers,
  // so nothing noticed that it happily returned DRAFTS. Story 2.4 is what wires it
  // to a public URL, which is exactly when "unpublished items are never
  // enumerable" stops being theoretical. `findFirst`, not `findUnique`, because
  // the latter accepts only unique fields in `where`.
  return queryProductDetail({ slug }, locale);
}

/**
 * Uncached SQL read BY ID — what the cached detail entry actually recomputes.
 *
 * The cached closure must query by the SAME id its cache key carries (2.4
 * review): when it queried by the caller's slug instead, a slug rename let two
 * slugs alias one id-keyed entry and whichever was requested first poisoned the
 * other — measured serving not-found on a published product's new canonical URL.
 */
export async function queryProductById(id: string, locale: Locale): Promise<ProductDetail | null> {
  return queryProductDetail({ id }, locale);
}

async function queryProductDetail(
  where: { slug: string } | { id: string },
  locale: Locale,
): Promise<ProductDetail | null> {
  const product = await prisma.product.findFirst({
    where: { ...where, status: "published" },
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
      isFallback: mt?.isFallback ?? false,
    },
    category: {
      slug: product.category.slug,
      name: ct?.value.name ?? product.category.slug,
      isFallback: ct?.isFallback ?? false,
    },
    attributes: product.attributes,
  };
}

/**
 * How many sibling/accessory cards the detail page shows. Three, matching the
 * 3-column grid EXPERIENCE.md § Responsive specifies (the same figure the 2.1
 * review settled for the industry blocks).
 */
export const RELATED_LIMIT = 3;

/**
 * Products related to `slug`, for the detail page's "Related products" block.
 *
 * WHAT "RELATED" MEANS HERE — SAME CATEGORY (Story 2.4 decision Q1). The schema
 * has no `related` relation, so the candidates were category, series and
 * manufacturer. MEASURED on the current seed: all three return IDENTICAL sets
 * (fd-9500 ↔ fd-9300, everything else empty), so the seed cannot choose between
 * them and the decision rests on structure and meaning instead:
 *   - `categoryId` is a REQUIRED FK, so the relation is always DEFINED. `seriesId`
 *     is nullable and null for 4 of the 6 seeded products, which makes "related"
 *     undefined rather than empty for most of the catalogue.
 *   - Manufacturer would relate an SCBA air set to a flame detector because one
 *     vendor makes both. A buyer reading a spec sheet wants alternatives in the
 *     same EQUIPMENT CLASS, not the rest of a vendor's catalogue.
 *
 * `status: "published"` again: `as-60`'s only category sibling is `wc-95`, which
 * is DRAFT — so this filter is the difference between an empty block and
 * publishing work in progress.
 */
export async function listRelatedProducts(
  slug: string,
  locale: Locale,
  limit: number = RELATED_LIMIT,
): Promise<ProductCardItem[]> {
  return cached(
    () => queryRelatedProducts(slug, locale, limit),
    ["related-products", slug, locale, String(limit)],
    [TAGS.catalog, TAGS.documents],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryRelatedProducts(
  slug: string,
  locale: Locale,
  limit: number = RELATED_LIMIT,
): Promise<ProductCardItem[]> {
  const self = await prisma.product.findUnique({
    where: { slug },
    select: { id: true, categoryId: true },
  });
  if (!self) return [];

  const products = await prisma.product.findMany({
    where: {
      status: "published",
      categoryId: self.categoryId,
      // Never the product you are already looking at.
      id: { not: self.id },
    },
    include: CARD_INCLUDE,
    orderBy: { slug: "asc" },
    take: limit,
  });

  return products.map((product) => toProductCardItem(product, locale));
}

/**
 * Compatible accessories for `slug` (FR14's phased half, via the
 * `AccessoryCompatibility` join table).
 *
 * THE TABLE IS EMPTY REPO-WIDE, so on the current seed this always returns `[]`
 * and the page omits the section — which is precisely what the AC asks for
 * ("when absent, the section is omitted cleanly"). The populated branch is proven
 * by a self-seeded integration test rather than pretended.
 *
 * The `status: "published"` filter is not defensive boilerplate here: the seed's
 * obvious accessory is `wc-95` ("fits FD-9500"), and it is DRAFT. Wiring it
 * without this filter would publish an unfinished catalogue entry.
 */
export async function listAccessoriesForProduct(
  slug: string,
  locale: Locale,
  limit: number = RELATED_LIMIT,
): Promise<ProductCardItem[]> {
  return cached(
    () => queryAccessoriesForProduct(slug, locale, limit),
    ["accessories", slug, locale, String(limit)],
    [TAGS.catalog, TAGS.documents],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryAccessoriesForProduct(
  slug: string,
  locale: Locale,
  limit: number = RELATED_LIMIT,
): Promise<ProductCardItem[]> {
  const products = await prisma.product.findMany({
    where: {
      status: "published",
      accessoryOf: { some: { product: { slug } } },
    },
    include: CARD_INCLUDE,
    orderBy: { slug: "asc" },
    take: limit,
  });

  return products.map((product) => toProductCardItem(product, locale));
}

/**
 * Every published product reduced to the fields `productSignals` needs — ONE
 * query for the whole sitemap (Story 2.4 decision Q3).
 *
 * WHY THIS EXISTS RATHER THAN A LOOP: the sitemap already carries an N+1 for
 * industries (six `getIndustryPageData` calls per locale, a live defer at
 * 120 reads / 3.2s cold), and products are the larger set — a per-product read
 * would make `/sitemap.xml` scale with the catalogue. React's `cache()` cannot
 * rescue it either: it is INERT in Route Handlers (measured in Story 2.1 —
 * 3 calls, 3 executions), and `sitemap.ts` is one.
 *
 * `_count` gives the document tally without loading the rows.
 */
export interface ProductSignalRow {
  slug: string;
  isFallback: boolean;
  manufacturerIsFallback: boolean;
  categoryIsFallback: boolean;
  specCount: number;
  documentCount: number;
}

export async function listProductSignals(locale: Locale): Promise<ProductSignalRow[]> {
  return cached(
    () => queryProductSignals(locale),
    ["product-signals", locale],
    [TAGS.catalog, TAGS.documents],
  );
}

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function queryProductSignals(locale: Locale): Promise<ProductSignalRow[]> {
  const products = await prisma.product.findMany({
    where: { status: "published" },
    select: {
      slug: true,
      attributes: true,
      translations: true,
      manufacturer: { select: { translations: true } },
      category: { select: { translations: true } },
      _count: { select: { documents: { where: { isPublic: true } } } },
    },
    orderBy: { slug: "asc" },
  });

  // THE ROUTE'S SLUG GATE APPLIES HERE TOO (2.4 review). The page's effective
  // predicate is isValidSlug AND productSignals — gateSlug runs before any read —
  // but the sitemap consumed these rows ungated, so a published row whose slug
  // violates the convention (nothing constrains Product.slug beyond @unique) was
  // ADVERTISED at a URL the route then refuses to serve: measured, a `zz-a&b`
  // row produced a sitemap <loc> whose exact URL answered the 200+noindex
  // not-found body. Filtering at the data source keeps "one predicate per
  // surface" true for every consumer of signal rows.
  return products
    .filter((product) => isValidSlug(product.slug))
    .map((product) => ({
      slug: product.slug,
      isFallback: resolveTranslation(product.translations, locale)?.isFallback ?? false,
      manufacturerIsFallback:
        resolveTranslation(product.manufacturer.translations, locale)?.isFallback ?? false,
      categoryIsFallback:
        resolveTranslation(product.category.translations, locale)?.isFallback ?? false,
      specCount: toSpecRows(product.attributes, Number.MAX_SAFE_INTEGER).length,
      documentCount: product._count.documents,
    }));
}

/**
 * Lower-case and strip everything outside `[a-z0-9]` — BYTE-IDENTICAL in effect
 * to the SQL expression in `products_model_trgm_idx`
 * (`regexp_replace(lower(model), '[^a-z0-9]', '', 'g')`, migration
 * 20260822153001_search_trgm). Both sides of the model match normalize the same
 * way; that equivalence is what lets `fd 9500`, `fd9500` and `FD-9500` all hit
 * the same index entry. Change one, change both.
 */
export function normalizeModelQuery(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Escape LIKE metacharacters so a query cannot smuggle wildcards — and escape
 * the escape character itself: an unescaped trailing `\` in the query would
 * produce an invalid `LIKE … ESCAPE '\'` sequence and turn a search into a 500.
 */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export interface SearchFilters {
  categorySlug?: string | null;
  manufacturerSlug?: string | null;
  seriesSlug?: string | null;
}

export interface SearchResultPage {
  products: ProductCardItem[];
  /** UNCAPPED match count — the toolbar's number (2.2's rule: never report the cap). */
  total: number;
}

/**
 * Model-number + name search with FR17's filter trio (Story 2.5).
 *
 * DELIBERATELY UNCACHED (decision Q2). `q` is attacker-controlled FREE TEXT —
 * not slug-shaped — so a `cached()` read keyed on it would mint unbounded 24h
 * Redis entries (the cardinality defer with the cap removed) and put arbitrary
 * bytes into Redis key names. The 2.4 review's rule ("keyParts must distinguish
 * everything the closure depends on") taken seriously means the key would need
 * raw `q`; the honest conclusion is no cache: one indexed query per request on
 * a `force-dynamic` page. The caller bounds `q` (trim, length cap) at the route
 * boundary; this function additionally treats blank as no-query.
 *
 * MATCHING (FR17 + FR19): the language-neutral `model` matches through the SAME
 * normalization as the expression index (see `normalizeModelQuery`), so paste
 * variants land; translated names match in the ACTIVE locale plus EN — the
 * fallback contract renders EN names on /tr and /ru, so search must match what
 * the page shows. Published only, as everywhere.
 *
 * TWO QUERIES BY DESIGN (decision Q1): a raw id-resolution (where the trgm
 * indexes and the locale-scoped EXISTS live), then `findMany` with the shared
 * `CARD_INCLUDE` — full `toProductCardItem` reuse, no raw-SQL duplication of
 * the card join, and `total` is the uncapped id count.
 */
export async function searchProducts(
  q: string | null,
  filters: SearchFilters,
  locale: Locale,
  limit: number = CATALOG_PRODUCT_CAP,
): Promise<SearchResultPage> {
  const conditions: Prisma.Sql[] = [Prisma.sql`p.status = 'published'`];

  const trimmed = q?.trim() ?? "";
  if (trimmed) {
    const normalized = normalizeModelQuery(trimmed);
    const nameLike = `%${escapeLike(trimmed.toLowerCase())}%`;
    // TWO INDEX-SERVED ARMS UNIONed, never `OR EXISTS` (2.5 review). Postgres
    // cannot BitmapOr an index arm against an EXISTS subplan, so the original
    // `(model LIKE … OR EXISTS (…))` shape made BOTH trgm indexes unusable and
    // every q-bearing search a full scan — measured 69.5ms/4,251 buffers for a
    // one-row answer at 20k, while this UNION form is 0.84ms/26 buffers. The
    // migration's own comment already called a seq scan "wrong at 50k (NFR)".
    //
    // A query that normalizes to nothing (e.g. "%%%") contributes NO model arm —
    // it must not degrade into match-everything.
    const arms: Prisma.Sql[] = [];
    if (normalized) {
      arms.push(Prisma.sql`
        SELECT pm.id FROM products pm
        WHERE regexp_replace(lower(pm.model), '[^a-z0-9]', '', 'g') LIKE ${`%${normalized}%`}
      `);
    }
    // ESCAPE '\\' in SOURCE, which cooks to a single backslash in the SQL text.
    // Writing `ESCAPE '\'` here (as shipped) collapses to `ESCAPE ''` — the
    // SQL-standard form that DISABLES escaping, so escapeLike's backslashes
    // became literal characters no name contains and any product whose NAME held
    // a `%` or `_` was unfindable (2.5 review; the "pinning" tests passed against
    // both states and could not tell them apart).
    arms.push(Prisma.sql`
      SELECT t.product_id AS id FROM product_translations t
      WHERE t.locale::text IN (${locale}, 'en')
        AND lower(t.name) LIKE ${nameLike} ESCAPE '\\'
    `);
    conditions.push(Prisma.sql`p.id IN (${Prisma.join(arms, " UNION ")})`);
  }

  if (filters.categorySlug) {
    conditions.push(
      Prisma.sql`p.category_id IN (SELECT c.id FROM categories c WHERE c.slug = ${filters.categorySlug})`,
    );
  }
  if (filters.manufacturerSlug) {
    conditions.push(
      Prisma.sql`p.manufacturer_id IN (SELECT m.id FROM manufacturers m WHERE m.slug = ${filters.manufacturerSlug})`,
    );
  }
  if (filters.seriesSlug) {
    conditions.push(
      Prisma.sql`p.series_id IN (SELECT s.id FROM series s WHERE s.slug = ${filters.seriesSlug})`,
    );
  }

  // LIMIT IN SQL, total via a WINDOW (2.5 review). The first version had no
  // LIMIT and sliced in JS, so the uncapped `total` was bought by shipping every
  // matching id to Node on every request — measured 20,005 uuids for a broad
  // query at 20k rows, growing linearly with catalogue size on a read that is
  // uncached by design. `count(*) OVER ()` keeps the total exact while only
  // `limit` rows cross the wire.
  const rows = await prisma.$queryRaw<{ id: string; total: bigint }[]>(
    Prisma.sql`SELECT p.id, count(*) OVER () AS total FROM products p
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY p.slug ASC
      LIMIT ${limit}`,
  );

  const pageIds = rows.map((row) => row.id);
  // The window repeats the same total on every row; zero rows means zero matches.
  const total = rows.length > 0 ? Number(rows[0].total) : 0;
  if (pageIds.length === 0) return { products: [], total };

  const products = await prisma.product.findMany({
    where: { id: { in: pageIds } },
    include: CARD_INCLUDE,
    orderBy: { slug: "asc" },
  });

  return {
    products: products.map((product) => toProductCardItem(product, locale)),
    total,
  };
}

export interface SearchSuggestion {
  slug: string;
  name: string;
  model: string;
  isFallback: boolean;
}

/** How many "did you mean" suggestions the zero-result state offers. */
const SUGGESTION_LIMIT = 3;

/**
 * The similarity floor, MEASURED against the seed (2026-08-22, pg_trgm on the
 * normalized-model expression): near-misses score high (`fd950`→FD-9500 0.625,
 * `fd9500x`→FD-9500 0.667, and `fd950`→FD-9300 lands exactly 0.3 — a useful
 * second suggestion), while garbage tops out far below (`xyzzyplugh`→XB-200
 * 0.0625). 0.3 admits the real neighbours and nothing else.
 */
const SUGGESTION_FLOOR = 0.3;

/**
 * "Did you mean" for the FR17a zero-result state (decision Q4): `pg_trgm`
 * similarity on the normalized model, so a truncated or fat-fingered model
 * number suggests the real catalogue entries — each a product link, not a
 * canned query. UNCACHED for the same reason as `searchProducts`. Published
 * only: a draft must not leak through a suggestion any more than through a
 * result.
 *
 * THE `%` OPERATOR IS LOAD-BEARING, NOT DECORATION (2.5 review). A bare
 * `similarity(expr, q) >= floor` predicate is UN-INDEXABLE — only the `%`/`<%`
 * operators can use a GIN trgm index — so the shipped form full-scanned the
 * catalogue on every zero-result query, i.e. on the attacker's cheapest input,
 * uncached and unmemoised (measured: full scan of every published row, ~50ms at
 * 40k, versus ~4ms index-served). `%` compares against
 * `pg_trgm.similarity_threshold`, whose default is 0.3 — exactly SUGGESTION_FLOOR
 * — but the explicit `similarity(...) >= floor` is KEPT beside it so the result
 * set stays correct even if a deployment changes that GUC. Index narrows, the
 * float re-checks; the measured 0.3-boundary behaviour is preserved (verified:
 * `similarity('fd9300','fd950') = 0.3` and `%` returns true for it).
 */
export async function suggestProducts(
  q: string,
  locale: Locale,
  filters: SearchFilters = {},
): Promise<SearchSuggestion[]> {
  const normalized = normalizeModelQuery(q);
  if (!normalized) return [];

  // THE SAME FILTERS THE SEARCH USED (2.5 review). `total === 0` can mean the
  // FACETS excluded an otherwise-perfect match, and the unfiltered suggestion
  // query then echoed the user's own query back at them: 'No results for
  // "FD-9500" … Did you mean: FD-9500'. A suggestion the active view cannot show
  // is not a suggestion.
  const scope: Prisma.Sql[] = [];
  if (filters.categorySlug) {
    scope.push(
      Prisma.sql` AND p.category_id IN (SELECT c.id FROM categories c WHERE c.slug = ${filters.categorySlug})`,
    );
  }
  if (filters.manufacturerSlug) {
    scope.push(
      Prisma.sql` AND p.manufacturer_id IN (SELECT m.id FROM manufacturers m WHERE m.slug = ${filters.manufacturerSlug})`,
    );
  }
  if (filters.seriesSlug) {
    scope.push(
      Prisma.sql` AND p.series_id IN (SELECT s.id FROM series s WHERE s.slug = ${filters.seriesSlug})`,
    );
  }
  const scopeSql = scope.length > 0 ? Prisma.join(scope, "") : Prisma.empty;

  const rows = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id
    FROM products p
    WHERE p.status = 'published'
      AND regexp_replace(lower(p.model), '[^a-z0-9]', '', 'g') % ${normalized}
      AND similarity(regexp_replace(lower(p.model), '[^a-z0-9]', '', 'g'), ${normalized}) >= ${SUGGESTION_FLOOR}${scopeSql}
    ORDER BY similarity(regexp_replace(lower(p.model), '[^a-z0-9]', '', 'g'), ${normalized}) DESC, p.slug ASC
    LIMIT ${SUGGESTION_LIMIT}
  `);
  if (rows.length === 0) return [];

  const products = await prisma.product.findMany({
    where: { id: { in: rows.map((row) => row.id) } },
    include: { translations: true },
  });
  // findMany loses the similarity ordering; restore it from the id sequence.
  const byId = new Map(products.map((product) => [product.id, product]));
  return rows.flatMap((row) => {
    const product = byId.get(row.id);
    if (!product) return [];
    const t = resolveTranslation(product.translations, locale);
    return [
      {
        slug: product.slug,
        name: t?.value.name ?? product.model,
        model: product.model,
        isFallback: t?.isFallback ?? false,
      },
    ];
  });
}

// ---- Writes (Story 4.3, admin CRUD) ---------------------------------------

export interface ProductAttributePair {
  key: string;
  value: string;
}

export interface ProductEditData {
  id: string;
  slug: string;
  model: string;
  manufacturerId: string;
  categoryId: string;
  seriesId: string | null;
  status: "draft" | "published";
  attributes: ProductAttributePair[];
  translations: { locale: Locale; name: string; description: string | null }[];
}

/** JSONB `attributes` → the form's ordered key/value pairs (non-object → empty). */
function attributesToPairs(value: Prisma.JsonValue): ProductAttributePair[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, v]) => ({
    key,
    value: typeof v === "string" ? v : String(v),
  }));
}

/** Load one product's editable fields + raw translations, or null if absent. */
export async function getProductForEdit(id: string): Promise<ProductEditData | null> {
  const row = await prisma.product.findUnique({ where: { id }, include: { translations: true } });
  if (!row) return null;
  return {
    id: row.id,
    slug: row.slug,
    model: row.model,
    manufacturerId: row.manufacturerId,
    categoryId: row.categoryId,
    seriesId: row.seriesId,
    status: row.status,
    attributes: attributesToPairs(row.attributes),
    translations: row.translations.map((t) => ({
      locale: t.locale,
      name: t.name,
      description: t.description,
    })),
  };
}

export interface ProductWriteFields {
  model: string;
  manufacturerId: string;
  categoryId: string;
  seriesId?: string;
  status: "draft" | "published";
  attributes: Record<string, string>;
}

/** Create a product (media defaults to []; Story 4.5 owns media). Throws on duplicate slug. */
export async function createProduct(
  data: ProductWriteFields & {
    slug: string;
    translations: { locale: Locale; name: string; description: string | null }[];
  },
): Promise<{ id: string; slug: string }> {
  return prisma.product.create({
    data: {
      slug: data.slug,
      model: data.model,
      manufacturerId: data.manufacturerId,
      categoryId: data.categoryId,
      seriesId: data.seriesId ?? null,
      status: data.status,
      attributes: data.attributes,
      translations: {
        create: data.translations.map((t) => ({
          locale: t.locale,
          name: t.name,
          description: t.description,
        })),
      },
    },
    select: { id: true, slug: true },
  });
}

/**
 * Update a product's editable scalars + replace its translations. `slug` and
 * `media` are intentionally NOT touched (slug is immutable in 4.3; media is
 * Story 4.5). Returns false if the product is gone.
 */
export async function updateProduct(
  id: string,
  fields: ProductWriteFields,
  translations: { locale: Locale; name: string; description: string | null }[],
): Promise<boolean> {
  const exists = await prisma.product.findUnique({ where: { id }, select: { id: true } });
  if (!exists) return false;
  await prisma.$transaction([
    prisma.product.update({
      where: { id },
      data: {
        model: fields.model,
        manufacturerId: fields.manufacturerId,
        categoryId: fields.categoryId,
        seriesId: fields.seriesId ?? null,
        status: fields.status,
        attributes: fields.attributes,
      },
    }),
    prisma.productTranslation.deleteMany({ where: { productId: id } }),
    prisma.productTranslation.createMany({
      data: translations.map((t) => ({
        productId: id,
        locale: t.locale,
        name: t.name,
        description: t.description,
      })),
    }),
  ]);
  return true;
}

/**
 * References that block a product delete. BOM lines / accessory pairings /
 * cross-references make it "in use"; documents are excluded on purpose — a
 * versioned datasheet `SetNull`s its product link and must survive (schema:239).
 */
export async function productReferenceCounts(
  id: string,
): Promise<{ bomLines: number; accessories: number; crossReferences: number }> {
  const [bomLines, asProduct, asAccessory, crossReferences] = await Promise.all([
    prisma.projectBomLine.count({ where: { productId: id } }),
    prisma.accessoryCompatibility.count({ where: { productId: id } }),
    prisma.accessoryCompatibility.count({ where: { accessoryProductId: id } }),
    prisma.crossReference.count({ where: { productId: id } }),
  ]);
  return { bomLines, accessories: asProduct + asAccessory, crossReferences };
}

/** Delete a product (translations cascade). Caller must check references first. */
export async function deleteProduct(id: string): Promise<void> {
  await prisma.product.delete({ where: { id } });
}

export interface AdminProductRow {
  id: string;
  slug: string;
  model: string;
  name: string;
  status: "draft" | "published";
}

/**
 * Every product for the admin list — ALL statuses, uncached (admin sees drafts,
 * and must see them the instant they are saved). Public reads keep their
 * `status: "published"` filter; this reader is the ONLY one that returns drafts.
 */
export async function listProductsForAdmin(locale: Locale): Promise<AdminProductRow[]> {
  const rows = await prisma.product.findMany({
    include: { translations: true },
    orderBy: { slug: "asc" },
  });
  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    model: p.model,
    name: resolveTranslation(p.translations, locale)?.value.name ?? p.model,
    status: p.status,
  }));
}
