import { isIP } from "node:net";
import { getCacheRedis, isCacheRedisConfigured, throttledError } from "./redis";

/**
 * Generic fixed-window rate limiter (Story 3.7a — FR32/NFR6) and the client-key
 * derivation its consumers share.
 *
 * REUSABLE BY DESIGN (epics:926): `POST /api/rfq` keys `rfq:rl:*` today;
 * Story 4.1's admin login lockout consumes THIS module with the reserved
 * `login:rl:*` keyspace rather than re-implementing. The command surface is a
 * narrow injectable interface so unit tests hand in fakes — counting, erroring,
 * and NEVER-RESOLVING ones — without simulating node-redis.
 *
 * THE ALGORITHM (proven live on redis 7.4.10 / node-redis 6.2.0): one atomic
 * `MULTI: INCR key · EXPIRE key <window> NX · TTL key`. `NX` anchors the window
 * at the FIRST hit and closes the crashed-between-INCR-and-EXPIRE
 * immortal-counter race without Lua. `count > limit` ⇒ limited, with the key's
 * remaining TTL as `retryAfterSeconds`.
 *
 * FAIL-OPEN, VISIBLY, WITHIN A BOUND (epics:940-942): any Redis error — sync
 * throw, op rejection, or simply never answering — yields `allowed: true`
 * inside `timeoutMs` (default 500ms), logging a stable greppable code
 * (`[rfq-rl] limiter unavailable — failing open`) at error level, throttled to
 * one line per 30s. The ONE silent allow: `REDIS_URL` unset/empty — that is
 * configuration (the DB-free build, a dev without Redis), not an outage.
 * FR27's persist-first guarantee is why open is the only acceptable direction;
 * the never-settling-connect trap is why the outer timeout race is not
 * optional — without it, "fail open" is "hang forever", i.e. fail CLOSED.
 */

/** The minimal command surface the limiter needs — node-redis v6 satisfies it. */
export interface RateLimitCommands {
  multi(): RateLimitMulti;
}

export interface RateLimitMulti {
  incr(key: string): RateLimitMulti;
  expire(key: string, seconds: number, mode?: "NX" | "XX" | "GT" | "LT"): RateLimitMulti;
  ttl(key: string): RateLimitMulti;
  exec(): Promise<unknown[]>;
}

export interface RateLimitOptions {
  /** Key prefix incl. trailing colon — `"rfq:rl:"` (RFQ), `"login:rl:"` (4.1, reserved). */
  keyspace: string;
  /** The derived client identity (see `clientKeyFromForwardedFor`). */
  client: string;
  /** Requests allowed per window. The window's (limit+1)th is rejected. */
  limit: number;
  windowSeconds: number;
  /** Greppable log code; defaults to the keyspace with `:` → `-` (`rfq-rl`). */
  label?: string;
  /** The whole check's latency bound. Timeout ⇒ fail open. */
  timeoutMs?: number;
  /** Test seam: inject a fake. Defaults to the shared lazy cache client. */
  getCommands?: () => Promise<RateLimitCommands | null>;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Present when limited: the window's remaining seconds (→ `Retry-After`). */
  retryAfterSeconds?: number;
}

class RateLimitTimeout extends Error {
  constructor() {
    super("rate-limit check timed out");
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new RateLimitTimeout()), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
  const label = options.label ?? options.keyspace.replace(/:+$/, "").replace(/:/g, "-");
  const timeoutMs = options.timeoutMs ?? 500;
  const getCommands = options.getCommands ?? getCacheRedis;

  // Unconfigured is a CHOICE, not an outage — allow silently (see docstring).
  if (!options.getCommands && !isCacheRedisConfigured()) {
    return { allowed: true };
  }

  try {
    const result = await withTimeout(
      (async () => {
        const commands = await getCommands();
        if (!commands) return null;
        const key = options.keyspace + options.client;
        return commands.multi().incr(key).expire(key, options.windowSeconds, "NX").ttl(key).exec();
      })(),
      timeoutMs,
    );

    if (result === null) {
      throttledError(label, "limiter unavailable — failing open (no Redis client)");
      return { allowed: true };
    }

    const count = Number(result[0]);
    const ttl = Number(result[2]);
    if (!Number.isFinite(count)) {
      throttledError(label, "limiter unavailable — failing open (unexpected reply shape)");
      return { allowed: true };
    }
    if (count > options.limit) {
      return {
        allowed: false,
        retryAfterSeconds: Number.isFinite(ttl) && ttl > 0 ? ttl : options.windowSeconds,
      };
    }
    return { allowed: true };
  } catch (error) {
    throttledError(label, "limiter unavailable — failing open", error);
    return { allowed: true };
  }
}

/**
 * THE WRITTEN TRUSTED-PROXY POLICY's derivation half (Task 0 #6; the policy
 * prose lives in the RFQ route docstring and `.env.example`).
 *
 * Trust the RIGHTMOST `x-forwarded-for` entry, and only it: production runs
 * behind exactly ONE trusted edge that appends (or replaces) the header, so
 * the rightmost entry is edge-written — every hop left of it is
 * client-supplied noise and is ignored. Next's standalone server FILLS the
 * header from the socket address when a request arrives without one, so under
 * a real server the header is never absent; the `"unknown"` bucket is
 * reachable only from hand-built Requests and pathological values.
 *
 * `isIP` + the 45-char cap (IPv6 max textual length) bound what can reach a
 * Redis key: a non-IP value can never mint per-value keys — everything
 * malformed shares one bucket.
 */
export function clientKeyFromForwardedFor(header: string | null): string {
  const last = header?.split(",").pop()?.trim() ?? "";
  return last.length > 0 && last.length <= 45 && isIP(last) !== 0 ? last : "unknown";
}
