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
 * DESIGN RULE: a cache backend must never take the site down. Every path here is
 * bounded in time and degrades to "cache miss" (i.e. read straight from Postgres)
 * rather than hanging or throwing into a render.
 *
 * That rule was violated in the first cut of this file, and the code review caught
 * it by running it: node-redis's DEFAULT reconnect strategy retries forever, so
 * `client.connect()` against an unreachable Redis NEVER settles — neither resolving
 * nor rejecting. `await redis()` therefore hung every render, in `next dev` as well
 * as production, and the silent `error` listener meant nothing was logged. A stopped
 * Redis produced a 25-second empty response and an empty log. Hence the three
 * defences below: a bounded initial connect, a memo that is cleared on failure so a
 * later request can retry, and a hard timeout around every operation.
 */

const { createClient } = require("redis");

const ENTRY_PREFIX = "glh:cache:";
const TAG_PREFIX = "glh:tag:";

/** Entries are kept far longer than `revalidate`; Next owns freshness, Redis only reclaims. */
const ENTRY_TTL_SECONDS = 60 * 60 * 24;

/** Bounds on the initial connect. Past this, a render reads from Postgres instead. */
const CONNECT_TIMEOUT_MS = 2000;
const CONNECT_MAX_RETRIES = 5;

/**
 * Ceiling on any single handler call. Deliberately short: the whole point of the
 * cache is to be faster than Postgres, so a Redis that cannot answer in this long
 * has nothing to offer and the read should just fall through.
 */
const OPERATION_TIMEOUT_MS = 500;

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

/** Rate-limited so a sustained outage cannot flood the log with one line per render. */
let lastLogAt = 0;
function warn(message, error) {
  const now = Date.now();
  if (now - lastLogAt < 30_000) return;
  lastLogAt = now;
  const detail = error && error.message ? `: ${error.message}` : "";
  console.error(`[cache-handler] ${message}${detail} — serving from the database instead.`);
}

/** Resolves `fallback` rather than hanging, whatever the wrapped promise does. */
function withTimeout(promise, ms, fallback, label) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => {
      warn(`${label} exceeded ${ms}ms`);
      resolve(fallback);
    }, ms);
    if (typeof timer.unref === "function") timer.unref();
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** Lazily-connected singleton. Never throws, never hangs; null means "no cache". */
let clientPromise = null;
/** Once a connection has succeeded, keep healing forever; only COLD start gives up. */
let connectedOnce = false;

function openClient() {
  const client = createClient({
    url: process.env.REDIS_URL,
    socket: {
      connectTimeout: CONNECT_TIMEOUT_MS,
      reconnectStrategy: (retries) => {
        // After a successful connect, retry indefinitely: commands carry their own
        // timeout, so a mid-life outage degrades to misses and self-heals.
        if (connectedOnce) return Math.min(retries * 100, 2000);
        // At cold start, returning a number forever is what made connect() never
        // settle. `false` makes it reject so the caller can fall through.
        return retries >= CONNECT_MAX_RETRIES ? false : Math.min(retries * 100, 500);
      },
    },
  });
  // Without a listener, node-redis escalates connection errors to unhandled
  // exceptions and kills the server process. It is rate-limited, not silenced:
  // a cache that is quietly broken in production is its own outage.
  client.on("error", (error) => warn("redis connection error", error));
  return client.connect().then(() => {
    connectedOnce = true;
    return client;
  });
}

function redis() {
  if (!process.env.REDIS_URL) return Promise.resolve(null);
  if (!clientPromise) {
    let opening;
    try {
      // `createClient` throws SYNCHRONOUSLY on an unparseable REDIS_URL. Uncaught,
      // that rejection escaped `get()` and Next turned it into a 500 on every page.
      opening = openClient();
    } catch (error) {
      warn("invalid REDIS_URL", error);
      return Promise.resolve(null);
    }
    clientPromise = opening.catch((error) => {
      warn("redis unavailable", error);
      // Do NOT latch the failure for the lifetime of the process: clear the memo so
      // the next request attempts a fresh connect instead of inheriting a null.
      clientPromise = null;
      return null;
    });
  }
  return clientPromise;
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
async function readEntry(cacheKey) {
  const client = await redis();
  if (!client) return null;

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
}

async function writeEntry(cacheKey, data, ctx) {
  const client = await redis();
  if (!client) return;

  // Tags arrive on the context for the fetch-cache path `unstable_cache` uses.
  const tags = (ctx && ctx.tags) || [];
  const payload = JSON.stringify({ lastModified: Date.now(), value: data, tags });

  await client.set(ENTRY_PREFIX + cacheKey, payload, { EX: ENTRY_TTL_SECONDS });
}

async function stampTags(list) {
  const client = await redis();
  if (!client) return false;

  const now = Date.now();
  const multi = client.multi();
  for (const tag of list) multi.set(TAG_PREFIX + tag, String(now));
  await multi.exec();
  return true;
}

module.exports = class RedisCacheHandler {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async get(cacheKey) {
    try {
      return await withTimeout(readEntry(cacheKey), OPERATION_TIMEOUT_MS, null, "cache read");
    } catch (error) {
      warn("cache read failed", error);
      return null; // degrade to a miss
    }
  }

  async set(cacheKey, data, ctx) {
    // Refuse anything this codec cannot faithfully round-trip (see CACHEABLE_KIND).
    if (!data || data.kind !== CACHEABLE_KIND) return;

    try {
      await withTimeout(
        writeEntry(cacheKey, data, ctx),
        OPERATION_TIMEOUT_MS,
        undefined,
        "cache write",
      );
    } catch (error) {
      // A failed cache write must never fail the request that triggered it.
      warn("cache write failed", error);
    }
  }

  /**
   * Invalidate tags.
   *
   * Next passes `(tags, durations)`; the second argument is a cache profile that
   * only means something to a Next-native handler, where e.g. `"max"` marks an
   * entry stale-now and hard-expiring much later. This handler has one mode —
   * stamp the tag, which makes every entry carrying it miss on the next read — so
   * `durations` is deliberately ignored and every profile becomes an immediate
   * purge. That is what an admin publish wants; it is NOT Next's own semantics.
   *
   * A failure here is logged rather than swallowed. It used to be swallowed on the
   * stated grounds that "the caller verifies separately and reports its own status"
   * — the caller (`src/app/api/revalidate/route.ts`) does no such thing and
   * structurally cannot: `revalidateTag` returns void. A failed stamp means an
   * admin's publish silently did nothing until the 60s backstop expires, so it has
   * to be visible somewhere.
   */
  async revalidateTag(tags) {
    const list = Array.isArray(tags) ? tags : [tags];
    if (list.length === 0) return;

    try {
      const stamped = await withTimeout(
        stampTags(list),
        OPERATION_TIMEOUT_MS,
        false,
        "tag invalidation",
      );
      if (!stamped) warn(`tag invalidation did not complete for [${list.join(", ")}]`);
    } catch (error) {
      warn(`tag invalidation failed for [${list.join(", ")}]`, error);
    }
  }

  resetRequestCache() {
    // No per-request memoisation to clear — every read goes to Redis.
  }
};
