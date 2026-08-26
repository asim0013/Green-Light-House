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
 * one line per 30s. FR27's persist-first guarantee is why open is the only
 * acceptable direction; the never-settling-connect trap is why the outer
 * timeout race is not optional — without it, "fail open" is "hang forever",
 * i.e. fail CLOSED. ⚠️ A TIMED-OUT CHECK STILL LANDS ITS `INCR` (the raced
 * work is not cancelled — nothing in the Redis protocol can un-send it), so
 * stored counts are an UPPER bound on enforced requests, never a lower one:
 * a request allowed through a timeout was still counted (3.7a review).
 *
 * The one allow that is not an outage: `REDIS_URL` unset/empty — configuration
 * (the DB-free build, a dev without Redis). It is silent in development and
 * logged ONCE per process in production, because shipping FR32's endpoint with
 * no limiter at all is a deployment defect that must not be invisible.
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

  // Unconfigured is a CHOICE, not an outage — but in production it means
  // FR32's endpoint is shipping unthrottled, which must never be invisible.
  if (!options.getCommands && !isCacheRedisConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throttledError(`${label}-unconfigured`, "no REDIS_URL — rate limiting is DISABLED");
    }
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
 * IPv6 addresses are bucketed by their /64 PREFIX, never the full address
 * (3.7a review — the sharpest finding): a routine /64 delegation hands one
 * attacker 2^64 valid, edge-written rightmost entries, each of which would
 * otherwise mint its own 5/hour bucket — an unlimited limiter, behind exactly
 * the trusted edge the policy defends (live-probed: one /64 → 8 distinct
 * keys). /64 is the standard smallest routable allocation, so it is the
 * smallest unit an operator cannot cheaply multiply. IPv4 keeps its full
 * address: /32 IS the host there.
 *
 * Canonicalization matters as much as truncation — `2001:DB8::1`,
 * `2001:db8:0:0:0:0:0:1` and `2001:db8::1` are ONE host and must be ONE
 * bucket. Node's `net` has no expander, so this does it explicitly: split on
 * `::`, pad the elided run with zero groups, lowercase, take the first four.
 */
function ipv6Bucket(address: string): string {
  const [head, tail] = address.split("::");
  const headGroups = head ? head.split(":").filter(Boolean) : [];
  const tailGroups = tail ? tail.split(":").filter(Boolean) : [];
  // An IPv4-mapped tail ("::ffff:1.2.3.4") is left to the generic path below;
  // its dotted group never parses as a hextet, which is harmless here because
  // only the first four groups are used and mapped addresses are /96-scoped.
  const groups =
    address.includes("::") && headGroups.length + tailGroups.length < 8
      ? [
          ...headGroups,
          ...Array(8 - headGroups.length - tailGroups.length).fill("0"),
          ...tailGroups,
        ]
      : [...headGroups, ...tailGroups];
  return groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().replace(/^0+(?=.)/, ""))
    .join(":");
}

/**
 * THE WRITTEN TRUSTED-PROXY POLICY's derivation half (Task 0 #6; the policy
 * prose lives in the RFQ route docstring and `.env.example`).
 *
 * Trust the RIGHTMOST `x-forwarded-for` entry, and only it: production runs
 * behind exactly ONE trusted edge that appends (or replaces) the header, so
 * the rightmost entry is edge-written — every hop left of it is
 * client-supplied noise and is ignored. Next's standalone server fills the
 * header from the socket address when a request arrives without one
 * (source-verified, and the e2e proves the passthrough half live), so under a
 * real server the header is rarely absent.
 *
 * WHAT REACHES A REDIS KEY, precisely (3.7a review — the earlier "junk can
 * never mint keys" was too strong): a trailing `:port` and `[v6]` brackets are
 * stripped first, because real edges (IIS/ARR and several LBs) write them and
 * collapsing those deployments into one shared bucket would 429 the sixth
 * genuine buyer site-wide. Zone IDs (`fe80::1%eth0`) are REJECTED — `isIP`
 * accepts them, they are meaningless on the wire, and their free-form suffix
 * is a per-value key-minting primitive. What remains is an `isIP`-valid
 * address, length-capped, IPv6-truncated to /64; everything else — including a
 * non-empty entry a misconfigured edge wrote — shares the single `"unknown"`
 * bucket, and `describeClientKey` lets the caller log that case so the
 * misconfiguration is detectable rather than silent.
 */
export function clientKeyFromForwardedFor(header: string | null): string {
  return describeClientKey(header).key;
}

export interface ClientKeyResult {
  key: string;
  /** True when a NON-EMPTY rightmost entry failed to parse — i.e. the edge is
   *  writing something this policy does not understand, and every such buyer
   *  is about to share one bucket. Callers should log it (throttled). */
  unparsed: boolean;
}

export function describeClientKey(header: string | null): ClientKeyResult {
  const raw = header?.split(",").pop()?.trim() ?? "";
  if (raw.length === 0) return { key: "unknown", unparsed: false };

  // `[2001:db8::1]:443` → `2001:db8::1`; `198.51.100.4:5678` → `198.51.100.4`.
  let candidate = raw;
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) candidate = bracketed[1];
  else if (/^[^:]+:\d+$/.test(candidate))
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));

  // Zone IDs are link-local and machine-scoped: never legitimate XFF content.
  if (candidate.includes("%") || candidate.length > 45) return { key: "unknown", unparsed: true };

  const version = isIP(candidate);
  if (version === 4) return { key: candidate, unparsed: false };
  if (version === 6) return { key: ipv6Bucket(candidate), unparsed: false };
  return { key: "unknown", unparsed: true };
}
