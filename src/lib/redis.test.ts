import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * `src/lib/redis.ts`'s own contract (Story 3.7a review — the module shipped
 * with ZERO direct tests: every limiter test injects a fake through
 * `getCommands`, which bypasses this file entirely, so the memoization, the
 * failure-cleared memo, the dead-client rebuild and the sync-throw guard were
 * asserted nowhere. The dead-client path was in fact broken — `destroy()`
 * throws on an already-closed client — and nothing could have caught it).
 *
 * `redis` is mocked wholesale: these tests own the module's DECISIONS, never
 * node-redis's behavior, and must never touch the developer's live instance
 * (vitest loads `.env`, so an unmocked client would connect for real).
 */

const createClient = vi.fn();
vi.mock("redis", () => ({ createClient: (options: unknown) => createClient(options) }));

interface FakeClient {
  isReady: boolean;
  connect: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
}

function fakeClient(over: Partial<FakeClient> = {}): FakeClient {
  return {
    isReady: true,
    connect: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    on: vi.fn(),
    ...over,
  };
}

const URL_A = "redis://localhost:6379";
let savedUrl: string | undefined;

beforeEach(async () => {
  savedUrl = process.env.REDIS_URL;
  createClient.mockReset();
  // Fresh module state (the memo) per test.
  vi.resetModules();
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = savedUrl;
  vi.restoreAllMocks();
});

/** Import AFTER resetModules so each test gets a virgin memo. */
async function loadModule() {
  return import("./redis");
}

describe("getCacheRedis — configuration", () => {
  it("unset or empty REDIS_URL → null, and no client is ever constructed", async () => {
    const { getCacheRedis, isCacheRedisConfigured } = await loadModule();
    delete process.env.REDIS_URL;
    expect(isCacheRedisConfigured()).toBe(false);
    expect(await getCacheRedis()).toBeNull();

    process.env.REDIS_URL = "   ";
    expect(isCacheRedisConfigured()).toBe(false);
    expect(await getCacheRedis()).toBeNull();
    // The DB-free build depends on this: no client, no connect, no env read at
    // module scope.
    expect(createClient).not.toHaveBeenCalled();
  });

  it("passes the bounded socket options — reconnectStrategy false is what stops the never-settling connect", async () => {
    process.env.REDIS_URL = URL_A;
    createClient.mockReturnValue(fakeClient());
    const { getCacheRedis } = await loadModule();
    await getCacheRedis();
    expect(createClient).toHaveBeenCalledWith(
      expect.objectContaining({
        url: URL_A,
        socket: expect.objectContaining({ reconnectStrategy: false, connectTimeout: 2000 }),
      }),
    );
  });
});

describe("getCacheRedis — never throws, never sticks", () => {
  it("a SYNC throw from createClient (malformed URL) → null, logged, no rethrow", async () => {
    process.env.REDIS_URL = "not a url";
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    createClient.mockImplementation(() => {
      throw new TypeError("Invalid URL");
    });
    const { getCacheRedis } = await loadModule();
    await expect(getCacheRedis()).resolves.toBeNull();
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("[redis-badurl]"),
      expect.any(Error),
    );
  });

  it("a failed connect → null, and the memo is CLEARED so the next caller retries", async () => {
    process.env.REDIS_URL = URL_A;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = fakeClient({ connect: vi.fn().mockRejectedValue(new Error("ECONNREFUSED")) });
    const healthy = fakeClient();
    createClient.mockReturnValueOnce(failing).mockReturnValueOnce(healthy);

    const { getCacheRedis } = await loadModule();
    expect(await getCacheRedis()).toBeNull();
    // Redis coming back mid-outage is the normal recovery path: a stuck memo
    // would keep the app disconnected until a redeploy.
    expect(await getCacheRedis()).toBe(healthy);
    expect(createClient).toHaveBeenCalledTimes(2);
  });

  it("a DEAD memoized client is discarded and rebuilt — even though destroy() throws on it", async () => {
    // The 3.7a review's confirmed defect: with reconnectStrategy:false,
    // node-redis closes the client itself when the socket dies, and destroy()
    // on a closed client throws SYNCHRONOUSLY. Un-guarded, this function
    // rejected on its first real exercise, breaking "never throws".
    process.env.REDIS_URL = URL_A;
    const dead = fakeClient({
      isReady: false,
      destroy: vi.fn(() => {
        throw new Error("The client is closed");
      }),
    });
    const healthy = fakeClient();
    createClient.mockReturnValueOnce(dead).mockReturnValueOnce(healthy);

    const { getCacheRedis } = await loadModule();
    const first = await getCacheRedis();
    expect(first).toBe(dead);
    // Socket died between calls.
    dead.isReady = false;
    await expect(getCacheRedis()).resolves.toBe(healthy);
    expect(dead.destroy).toHaveBeenCalled();
  });

  it("memoizes a healthy client — one connect across many callers", async () => {
    process.env.REDIS_URL = URL_A;
    const client = fakeClient();
    createClient.mockReturnValue(client);
    const { getCacheRedis } = await loadModule();
    const [a, b, c] = await Promise.all([getCacheRedis(), getCacheRedis(), getCacheRedis()]);
    expect(a).toBe(client);
    expect(b).toBe(client);
    expect(c).toBe(client);
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(client.connect).toHaveBeenCalledTimes(1);
  });

  it("a CHANGED REDIS_URL rebuilds rather than serving the old instance's client", async () => {
    process.env.REDIS_URL = URL_A;
    const first = fakeClient();
    const second = fakeClient();
    createClient.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const { getCacheRedis } = await loadModule();
    expect(await getCacheRedis()).toBe(first);
    process.env.REDIS_URL = "redis://localhost:6380";
    expect(await getCacheRedis()).toBe(second);
  });

  it("registers an error listener — an unhandled 'error' event would kill the process", async () => {
    process.env.REDIS_URL = URL_A;
    const client = fakeClient();
    createClient.mockReturnValue(client);
    const { getCacheRedis } = await loadModule();
    await getCacheRedis();
    expect(client.on).toHaveBeenCalledWith("error", expect.any(Function));
  });
});
