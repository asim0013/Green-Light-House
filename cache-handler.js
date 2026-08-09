/* eslint-disable @typescript-eslint/no-require-imports -- see the CommonJS note below */
/**
 * Redis-backed incremental cache handler (Story 1.8).
 *
 * CommonJS on purpose: Next loads this by path OUTSIDE the application bundle, so
 * it cannot use the `@/` alias, TypeScript, or anything from `src/`.
 *
 * Why the legacy singular `cacheHandler` and not the plural `cacheHandlers`:
 * the plural option exists only for the `use cache` directive, which requires
 * `cacheComponents: true` — and that flag is incompatible with the
 * `force-dynamic` this app relies on to keep builds database-free (see the
 * story's Task 0 spike). The singular handler is current in 16.2 (it gained
 * image-cache support in this very release) and backs `unstable_cache`.
 *
 * DESIGN RULE: a cache backend must never take the site down. Every Redis call is
 * wrapped so that an unreachable or misbehaving Redis degrades to "cache miss"
 * (i.e. read straight from Postgres) rather than throwing into a render.
 */

const { createClient } = require("redis");

const ENTRY_PREFIX = "glh:cache:";
const TAG_PREFIX = "glh:tag:";

/**
 * Only FETCH entries are stored.
 *
 * `unstable_cache` produces FETCH entries — plain JSON-safe values — which is
 * exactly what this app caches. The other kinds (APP_PAGE, PAGES) carry
 * `segmentData: Map<string, Buffer>`, and a Map does not survive
 * `JSON.stringify`: it round-trips as `{}` and the renderer then throws
 * `TypeError: segmentData.get is not a function` on every read.
 *
 * Rather than hand-roll Map/Buffer serialisation for entry kinds this app does
 * not use (its pages are `force-dynamic`, so there are no route-level entries to
 * preserve), unsupported kinds are simply not cached: `set` ignores them and
 * `get` misses, so Next recomputes. Route-level caching would need a richer
 * codec — see deferred-work.md.
 */
const CACHEABLE_KIND = "FETCH";

/** Lazily-connected singleton. Never throws — resolves to null when unavailable. */
let clientPromise = null;

function redis() {
  if (!process.env.REDIS_URL) return Promise.resolve(null);
  if (!clientPromise) {
    const client = createClient({ url: process.env.REDIS_URL });
    // Without a listener, node-redis escalates connection errors to unhandled
    // exceptions and kills the server process.
    client.on("error", () => {});
    clientPromise = client
      .connect()
      .then(() => client)
      .catch(() => null);
  }
  return clientPromise;
}

module.exports = class RedisCacheHandler {
  constructor(ctx) {
    this.ctx = ctx;
  }

  /**
   * Return a cached entry, or null for a miss.
   *
   * Tag invalidation is timestamp-based rather than key-tracking: each revalidated
   * tag records the moment it was invalidated, and an entry is stale if ANY of its
   * tags was invalidated after the entry was written. That avoids maintaining a
   * tag→keys index (which goes wrong under concurrency) and makes `revalidateTag`
   * O(1) regardless of how many entries carry the tag.
   */
  async get(cacheKey) {
    const client = await redis();
    if (!client) return null;

    try {
      const raw = await client.get(ENTRY_PREFIX + cacheKey);
      if (!raw) return null;

      const entry = JSON.parse(raw);

      // Defensive: only hand back kinds this codec round-trips. Protects against
      // entries left by an older build with different serialisation rules.
      if (!entry.value || entry.value.kind !== CACHEABLE_KIND) return null;

      const tags = Array.isArray(entry.tags) ? entry.tags : [];

      if (tags.length > 0) {
        const stamps = await client.mGet(tags.map((tag) => TAG_PREFIX + tag));
        const invalidatedAt = Math.max(0, ...stamps.map((s) => Number(s) || 0));
        if (invalidatedAt > entry.lastModified) {
          // Drop it so the next reader does not repeat this comparison.
          await client.del(ENTRY_PREFIX + cacheKey).catch(() => {});
          return null;
        }
      }

      return { lastModified: entry.lastModified, value: entry.value };
    } catch {
      return null; // degrade to a miss
    }
  }

  async set(cacheKey, data, ctx) {
    const client = await redis();
    if (!client) return;

    // Refuse anything this codec cannot faithfully round-trip (see CACHEABLE_KIND).
    if (!data || data.kind !== CACHEABLE_KIND) return;

    try {
      // Tags arrive on the context for the fetch-cache path `unstable_cache` uses;
      // fall back to the entry itself for other kinds.
      const tags = (ctx && ctx.tags) || (data && data.tags) || [];
      const payload = JSON.stringify({ lastModified: Date.now(), value: data, tags });

      // Expire well beyond the per-entry `revalidate` window so Next controls
      // freshness while Redis only reclaims genuinely abandoned keys.
      await client.set(ENTRY_PREFIX + cacheKey, payload, { EX: 60 * 60 * 24 });
    } catch {
      // A failed cache write must never fail the request that triggered it.
    }
  }

  async revalidateTag(tags) {
    const client = await redis();
    if (!client) return;

    const list = Array.isArray(tags) ? tags : [tags];
    if (list.length === 0) return;

    try {
      const now = Date.now();
      const multi = client.multi();
      for (const tag of list) multi.set(TAG_PREFIX + tag, String(now));
      await multi.exec();
    } catch {
      // Swallowing here would hide a failed publish, so the caller (the
      // /api/revalidate route) verifies separately and reports its own status.
    }
  }

  resetRequestCache() {
    // No per-request memoisation to clear — every read goes to Redis.
  }
};
