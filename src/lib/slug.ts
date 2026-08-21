/**
 * The project slug rule as ONE shared gate (lifted from `catalog-page.ts` in
 * Story 2.3 — the download handler needed it and duplication is how gates drift).
 *
 * Story 2.1's Decision 2 binds the shape: one slug per entity, shared across
 * locales, lowercase ASCII + digits, hyphen-separated, stored not derived,
 * matched exactly.
 *
 * WHAT THIS BOUNDS, honestly (2.2 review): SHAPE and LENGTH — malformed values
 * never reach a query or cache key, and the >247-char tag log-amplification
 * class is dead. It does NOT bound CARDINALITY: distinct valid-shaped unknown
 * slugs still mint one cache entry each. The existence-check fix for that class
 * is tracked in deferred-work.md.
 */
const SLUG_MAX_LENGTH = 64;
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isValidSlug(value: string): boolean {
  return value.length <= SLUG_MAX_LENGTH && SLUG_SHAPE.test(value);
}
