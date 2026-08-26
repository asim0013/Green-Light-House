import { describe, it, expect, vi, afterEach } from "vitest";
import {
  checkRateLimit,
  clientKeyFromForwardedFor,
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

  it("NEVER-RESOLVING client → allowed within the bound — the hang-catcher", async () => {
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
    expect(Date.now() - started).toBeLessThan(1_000);
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

  it("the outage log is throttled: one line per code per 30s", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const options = { ...BASE, label: "test-throttle", getCommands: async () => null };
    await checkRateLimit(options);
    await checkRateLimit(options);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("clientKeyFromForwardedFor — the written-policy derivation", () => {
  it("trusts the RIGHTMOST entry only — everything left is client-supplied noise", () => {
    expect(clientKeyFromForwardedFor("1.2.3.4, 5.6.7.8, 203.0.113.9")).toBe("203.0.113.9");
    expect(clientKeyFromForwardedFor("spoofed-junk, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("accepts a single IPv4 or IPv6 entry, trimmed", () => {
    expect(clientKeyFromForwardedFor("  198.51.100.4  ")).toBe("198.51.100.4");
    expect(clientKeyFromForwardedFor("2001:db8::1")).toBe("2001:db8::1");
  });

  it("everything malformed shares ONE bucket — non-IPs can never mint per-value keys", () => {
    expect(clientKeyFromForwardedFor(null)).toBe("unknown");
    expect(clientKeyFromForwardedFor("")).toBe("unknown");
    expect(clientKeyFromForwardedFor("evil-string")).toBe("unknown");
    // A port suffix is not an IP; neither is an over-long value (45 = IPv6 max).
    expect(clientKeyFromForwardedFor("1.2.3.4:5678")).toBe("unknown");
    expect(clientKeyFromForwardedFor("a".repeat(46))).toBe("unknown");
  });
});
