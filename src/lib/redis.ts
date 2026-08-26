import { createClient } from "redis";

/**
 * The app-side CACHE-Redis client (Story 3.7a) — the architecture's reserved
 * `lib/redis` slot, finally built. A TS port of `cache-handler.js`'s
 * degradation discipline for code that runs INSIDE the Next server (the cache
 * handler itself must stay CJS outside the bundle and cannot be imported).
 *
 * `REDIS_URL` ONLY — the disposable cache instance. The durable queue
 * instance (`REDIS_QUEUE_URL`) must never be touched from here: its tuning is
 * queue-shaped, and locally the container is not even running (a connect
 * against :6380 under node-redis's default reconnect NEVER SETTLES — the 3.0
 * review's trap, which is why every bound below exists).
 *
 * The discipline, element by element (each one has drawn blood):
 *  - IMPORT-INERT: no env read, no client, at module scope — the DB-free build
 *    imports the RFQ route with all three URLs blanked and must stay green.
 *  - Unset/empty `REDIS_URL` ⇒ `null`, SILENTLY — that is configuration, not
 *    an outage (`isCacheRedisConfigured` lets callers tell the two apart).
 *  - Sync-throw guard: `createClient` throws synchronously on a malformed URL
 *    (measured in cache-flush.mjs) — caught, logged, `null`.
 *  - `reconnectStrategy: false` + `connectTimeout`: the default strategy makes
 *    `connect()` never settle against a dead target; a bounded single attempt
 *    is what lets callers fail OPEN instead of hanging.
 *  - Error listener: without one, a socket error after connect is an unhandled
 *    'error' event that kills the process. Throttled — an outage must not log
 *    once per request.
 *  - FAILURE-CLEARED MEMO: a failed or dead client never sticks; the next
 *    caller retries the connect (Redis coming back mid-outage is the normal
 *    recovery path).
 */

const CONNECT_TIMEOUT_MS = 2_000;
const LOG_THROTTLE_MS = 30_000;

const lastLoggedAt = new Map<string, number>();

/** One coded error line per `code` per 30s — the cache-handler precedent. */
export function throttledError(code: string, message: string, error?: unknown): void {
  const now = Date.now();
  const last = lastLoggedAt.get(code) ?? 0;
  if (now - last < LOG_THROTTLE_MS) return;
  lastLoggedAt.set(code, now);
  if (error === undefined) console.error(`[${code}] ${message}`);
  else console.error(`[${code}] ${message}`, error);
}

export type CacheRedis = ReturnType<typeof createClient>;

/** True when `REDIS_URL` is set non-empty. A `null` client while configured is
 *  an OUTAGE (log it); unconfigured `null` is a choice (stay silent). */
export function isCacheRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL?.trim());
}

let memo: Promise<CacheRedis | null> | null = null;
let memoUrl: string | undefined;

async function connectOnce(url: string): Promise<CacheRedis | null> {
  let client: CacheRedis;
  try {
    client = createClient({
      url,
      socket: { connectTimeout: CONNECT_TIMEOUT_MS, reconnectStrategy: false },
    });
  } catch (error) {
    throttledError("redis", "invalid REDIS_URL — cache Redis disabled", error);
    return null;
  }
  client.on("error", (error) => {
    throttledError("redis", "cache Redis connection error", error);
  });
  try {
    await client.connect();
  } catch (error) {
    throttledError("redis", "cache Redis unreachable", error);
    return null;
  }
  return client;
}

/**
 * The lazy shared client, or `null` (unconfigured OR unreachable — see
 * `isCacheRedisConfigured` to distinguish). Never throws, never hangs beyond
 * the connect bound. A memoized client that has since died is discarded and
 * reconnected rather than returned.
 */
export async function getCacheRedis(): Promise<CacheRedis | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;

  if (memo && memoUrl === url) {
    const existing = await memo;
    if (existing?.isReady) return existing;
    // Dead or failed — clear and fall through to a fresh attempt.
    memo = null;
    if (existing) existing.destroy();
  }

  memoUrl = url;
  const attempt = connectOnce(url).then((client) => {
    if (!client) memo = null; // failure-cleared: the next caller retries
    return client;
  });
  memo = attempt;
  return attempt;
}
