import { unstable_cache } from "next/cache";

/**
 * The caching seam (Story 1.8).
 *
 * Every cached read in the app goes through `cached()`. That is deliberate: it is
 * the ONE place to change when this project migrates from `unstable_cache` to the
 * `use cache` directive, which is blocked today because `cacheComponents: true`
 * is incompatible with the `force-dynamic` that keeps builds database-free
 * (see the story's Task 0 spike, and deferred-work.md).
 *
 * Entries are stored in Redis by `cache-handler.js`.
 */

/**
 * Freshness backstop, in seconds.
 *
 * READ THIS BEFORE QUOTING IT AS A GUARANTEE. `unstable_cache` treats `revalidate`
 * as a STALE-WHILE-REVALIDATE trigger, not a freshness bound: once an entry is
 * older than this, the next request is still served the STALE value and the
 * refresh happens in the background, so the fresh value first appears on the
 * request AFTER that. On a low-traffic site — this project's stated launch
 * condition — "the request after" can be a long time.
 *
 * So the honest contract is: a *successful* `revalidateTag` is immediate (that is
 * the mechanism FR5/FR40 actually rely on, and `POST /api/revalidate` is its
 * trigger), and this TTL is only the backstop for a MISSED one — self-healing on
 * the second request past 60s rather than lingering indefinitely.
 *
 * 60s is deliberately short: the catalog is sparse and traffic is low at launch,
 * so the database load saved by a longer window is worth less than a prompt
 * backstop. Revisit when catalog volume actually makes DB reads expensive.
 */
export const CACHE_TTL_SECONDS = 60;

/**
 * Cache one read.
 *
 * `keyParts` MUST distinguish everything the result depends on — above all the
 * LOCALE. Every repository read here returns locale-resolved text, so a key that
 * omits it serves Turkish visitors whatever English happened to be cached first,
 * and no rendering test would notice.
 *
 * THE CACHE BOUNDARY IS A SERIALIZATION BOUNDARY. Values round-trip through JSON,
 * so anything that is not JSON-safe changes type on a cache HIT but not on a MISS
 * — which makes the bug look intermittent. A `Date` returns as an ISO string; a
 * `Map`, `Set`, `BigInt` or `undefined` fares worse. Callers must return JSON-safe
 * shapes or re-hydrate after this call (see `listPublishedProjects`).
 */
export function cached<T>(
  read: () => Promise<T>,
  keyParts: readonly string[],
  tags: readonly string[],
): Promise<T> {
  return unstable_cache(read, [...keyParts], {
    tags: [...tags],
    revalidate: CACHE_TTL_SECONDS,
  })();
}
