/**
 * Cache-tag convention (Story 1.8).
 *
 * The SINGLE source of every tag string in the app. Nothing else — repository,
 * route handler, or component — may hand-write a tag: a mistyped tag silently
 * turns `revalidateTag` into a no-op, so an admin's edit never goes live and the
 * symptom looks like ordinary staleness rather than a bug.
 *
 * `catalog`, `projects`, `product:{id}`, `industry:{slug}` and `manufacturer:{id}`
 * come from the architecture (§ Implementation Patterns → Process). The remaining
 * collection tags (`industries`, `categories`, `manufacturers` in Story 1.8;
 * `services`, `documents` in Story 2.1) are extensions, because the pages read
 * those collections and need something to invalidate them by; they follow the
 * same shape. Extending the typed helper is deliberate: reusing `catalog` for
 * services and certificates would make an admin's service edit require a
 * catalog-wide flush, and would put tag strings outside this file.
 */

/** Tags covering a whole collection. */
export const COLLECTION_TAGS = {
  /** All product/catalog surfaces (architecture). */
  catalog: "catalog",
  /** All project surfaces (architecture). */
  projects: "projects",
  /** Extension — the homepage industry entry points. */
  industries: "industries",
  /** Extension — the homepage category signposts. */
  categories: "categories",
  /** Extension — the homepage OEM marks. */
  manufacturers: "manufacturers",
  /** Extension (Story 2.1) — the services block on an industry landing page. */
  services: "services",
  /** Extension (Story 2.1) — the certificates block; documents are `Document` rows. */
  documents: "documents",
} as const;

export type CollectionTag = (typeof COLLECTION_TAGS)[keyof typeof COLLECTION_TAGS];

/** Every collection tag, for validation and for "revalidate everything" flows. */
export const ALL_COLLECTION_TAGS: readonly CollectionTag[] = Object.values(COLLECTION_TAGS);

/** Entity-tag prefixes, in the architecture's `entity:{id}` colon form. */
const ENTITY_PREFIXES = ["product", "industry", "manufacturer", "project"] as const;

export const TAGS = {
  ...COLLECTION_TAGS,
  product: (id: string) => `product:${id}` as const,
  industry: (slug: string) => `industry:${slug}` as const,
  manufacturer: (id: string) => `manufacturer:${id}` as const,
  project: (slug: string) => `project:${slug}` as const,
} as const;

/**
 * Whether `tag` is one this app actually issues.
 *
 * The revalidate route is reachable from outside the process, so it must not
 * forward arbitrary strings into `revalidateTag`. Ids and slugs are restricted to
 * the character set cuid/slug values actually use, which also rules out wildcards,
 * separators and traversal-looking values.
 */
export function isKnownTag(tag: string): boolean {
  if ((ALL_COLLECTION_TAGS as readonly string[]).includes(tag)) return true;

  const separator = tag.indexOf(":");
  if (separator < 1) return false;

  const prefix = tag.slice(0, separator);
  const id = tag.slice(separator + 1);
  if (!(ENTITY_PREFIXES as readonly string[]).includes(prefix)) return false;

  return /^[a-z0-9-]+$/.test(id);
}
