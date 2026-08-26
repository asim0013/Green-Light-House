import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  clientKeyFromForwardedFor,
  describeClientKey,
  type RateLimitCommands,
  type RateLimitMulti,
} from "./rate-limit";

/**
 * The limiter core, tested with INJECTED fakes (Story 3.7a, AC1/AC4) — never a
 * real client: vitest loads `.env` (vitest.setup.ts), so an un-injected test
 * would mutate the developer's LIVE cache Redis. The six-real-POSTs proof
 * lives in e2e per epics:934 — these tests own the window semantics, the
 * command shape, and every fail-open branch, including the one CI can never
 * reach (Redis down) and the one that distinguishes fail-open from
 * fail-closed-by-hanging (a never-resolving client).
 */

interface RecordedCall {
  command: string;
  args: unknown[];
}

function fakeCommands(replies: unknown[], calls: RecordedCall[] = []): RateLimitCommands {
  const multi: RateLimitMulti = {
    incr(key) {
      calls.push({ command: "incr", args: [key] });
      return multi;
    },
    expire(key, seconds, mode) {
      calls.push({ command: "expire", args: [key, seconds, mode] });
      return multi;
    },
    ttl(key) {
      calls.push({ command: "ttl", args: [key] });
      return multi;
    },
    exec: () => Promise.resolve(replies),
  };
  return { multi: () => multi };
}

const BASE = {
  keyspace: "rfq:rl:",
  client: "203.0.113.7",
  limit: 5,
  windowSeconds: 3600,
} as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("checkRateLimit — window semantics and command shape", () => {
  it("allows at the limit, rejects the (limit+1)th with the key's TTL as Retry-After", async () => {
    expect(
      await checkRateLimit({ ...BASE, getCommands: async () => fakeCommands([5, 1, 3599]) }),
    ).toEqual({ allowed: true });
    expect(
      await checkRateLimit({ ...BASE, getCommands: async () => fakeCommands([6, 0, 1234]) }),
    ).toEqual({ allowed: false, retryAfterSeconds: 1234 });
  });

  it("issues the exact atomic recipe: INCR key · EXPIRE key window NX · TTL key", async () => {
    const calls: RecordedCall[] = [];
    await checkRateLimit({ ...BASE, getCommands: async () => fakeCommands([1, 1, 3600], calls) });
    expect(calls).toEqual([
      { command: "incr", args: ["rfq:rl:203.0.113.7"] },
      // NX is what anchors the window at the FIRST hit and closes the
      // crashed-between-INCR-and-EXPIRE immortal-counter race.
      { command: "expire", args: ["rfq:rl:203.0.113.7", 3600, "NX"] },
      { command: "ttl", args: ["rfq:rl:203.0.113.7"] },
    ]);
  });

  it("is keyspace-generic: Story 4.1's login:rl:* works without edits", async () => {
    const calls: RecordedCall[] = [];
    const result = await checkRateLimit({
      keyspace: "login:rl:",
      client: "admin@glh.example",
      limit: 10,
      windowSeconds: 900,
      getCommands: async () => fakeCommands([11, 0, 42], calls),
    });
    expect(calls[0]).toEqual({ command: "incr", args: ["login:rl:admin@glh.example"] });
    expect(result).toEqual({ allowed: false, retryAfterSeconds: 42 });
  });

  it("falls back to the window length when TTL is missing or non-positive", async () => {
    const limited = await checkRateLimit({
      ...BASE,
      getCommands: async () => fakeCommands([9, 0, -1]),
    });
    expect(limited).toEqual({ allowed: false, retryAfterSeconds: 3600 });
  });
});

describe("checkRateLimit — every failure direction is OPEN, coded, and bounded", () => {
  it("erroring client → allowed, with the coded error log", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkRateLimit({
      ...BASE,
      label: "test-erroring",
      getCommands: async () => ({
        multi: () => {
          throw new Error("connection lost");
        },
      }),
    });
    expect(result).toEqual({ allowed: true });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[test-erroring] limiter unavailable — failing open"),
      expect.any(Error),
    );
  });

  it("NEVER-RESOLVING client → allowed within the INJECTED bound — the hang-catcher", async () => {
    // The test that separates fail-open from fail-closed-by-hanging: without
    // the outer timeout race this promise never settles and the test itself
    // times out RED (P5: delete the race and watch).
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const started = Date.now();
    const result = await checkRateLimit({
      ...BASE,
      label: "test-hanging",
      timeoutMs: 50,
      getCommands: () => new Promise(() => {}),
    });
    expect(result).toEqual({ allowed: true });
    // 400ms: 8× the injected bound (slow-CI-immune) but well under the 500ms
    // DEFAULT — so an implementation that ignored `options.timeoutMs` goes red
    // (3.7a review: the old <1000 bound could not tell 50 from 500, leaving
    // the injectable seam Story 4.1 consumes unproven).
    expect(Date.now() - started).toBeLessThan(400);
    expect(consoleError).toHaveBeenCalled();
  });

  it("null client while CONFIGURED → allowed, coded (an outage, never silent)", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkRateLimit({
      ...BASE,
      label: "test-nullclient",
      getCommands: async () => null,
    });
    expect(result).toEqual({ allowed: true });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[test-nullclient] limiter unavailable — failing open"),
    );
  });

  it("REDIS_URL unset + no injection → allowed SILENTLY (configuration, not outage)", async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await checkRateLimit({ ...BASE });
      expect(result).toEqual({ allowed: true });
      expect(consoleError).not.toHaveBeenCalled();
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });

  it("unexpected reply shape → allowed, coded", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await checkRateLimit({
      ...BASE,
      label: "test-badreply",
      getCommands: async () => fakeCommands(["OK", null, null]),
    });
    expect(result).toEqual({ allowed: true });
    expect(consoleError).toHaveBeenCalled();
  });

  it("the outage log is throttled AND recovers: one line, then another after 30s", async () => {
    // Both halves (3.7a review: the first version proved only suppression, so
    // a regression that logged once and then NEVER again would pass).
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const options = { ...BASE, label: "test-throttle", getCommands: async () => null };
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await checkRateLimit(options);
      await checkRateLimit(options);
      expect(consoleError).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(31_000);
      await checkRateLimit(options);
      expect(consoleError).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("clientKeyFromForwardedFor — the written-policy derivation", () => {
  it("trusts the RIGHTMOST entry only — everything left is client-supplied noise", () => {
    expect(clientKeyFromForwardedFor("1.2.3.4, 5.6.7.8, 203.0.113.9")).toBe("203.0.113.9");
    expect(clientKeyFromForwardedFor("spoofed-junk, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("keeps IPv4 whole — /32 IS the host there", () => {
    expect(clientKeyFromForwardedFor("  198.51.100.4  ")).toBe("198.51.100.4");
    expect(clientKeyFromForwardedFor("198.51.100.5")).not.toBe(
      clientKeyFromForwardedFor("198.51.100.4"),
    );
  });

  it("BUCKETS IPv6 BY /64 — one delegation cannot rotate through unlimited windows", () => {
    // The 3.7a review's sharpest finding: keyed on the full address, a routine
    // /64 gave an attacker 2^64 fresh 5/hour buckets behind the trusted edge.
    const a = clientKeyFromForwardedFor("2001:db8:abcd:1234::1");
    const b = clientKeyFromForwardedFor("2001:db8:abcd:1234:dead:beef:cafe:9999");
    expect(a).toBe(b);
    // …while a DIFFERENT /64 is still a different bucket.
    expect(clientKeyFromForwardedFor("2001:db8:abcd:9999::1")).not.toBe(a);
  });

  it("canonicalizes: one host written three ways is ONE bucket", () => {
    const canonical = clientKeyFromForwardedFor("2001:db8::1");
    expect(clientKeyFromForwardedFor("2001:DB8::1")).toBe(canonical);
    expect(clientKeyFromForwardedFor("2001:0db8:0000:0000:0000:0000:0000:0001")).toBe(canonical);
  });

  it("strips the port forms real edges write (ARR-style) instead of collapsing them", () => {
    // Un-stripped, these failed isIP and funnelled EVERY buyer behind such an
    // edge into the shared bucket — the sixth genuine inquiry site-wide 429s.
    expect(clientKeyFromForwardedFor("198.51.100.4:5678")).toBe("198.51.100.4");
    expect(clientKeyFromForwardedFor("[2001:db8:abcd:1234::1]:443")).toBe(
      clientKeyFromForwardedFor("2001:db8:abcd:1234::1"),
    );
  });

  it("malformed and zone-ID'd values share ONE bucket and are FLAGGED unparsed", () => {
    for (const value of ["evil-string", "fe80::1%eth0", "2001:db8::1%x", "a".repeat(46)]) {
      // Zone IDs pass net.isIP but are meaningless on the wire — un-rejected,
      // their free-form suffix mints one key per value (3.7a review).
      expect(describeClientKey(value), value).toEqual({ key: "unknown", unparsed: true });
    }
    // Absent/empty is NOT a misconfiguration signal — nothing to flag.
    expect(describeClientKey(null)).toEqual({ key: "unknown", unparsed: false });
    expect(describeClientKey("")).toEqual({ key: "unknown", unparsed: false });
  });
});
