import IORedis from "ioredis";

/**
 * Decide whether the queue-backed assertions can run (Story 3.3, AC13).
 *
 * THE ENVIRONMENT, NEVER THE SURFACE — the doctrine `dbReady.ts`,
 * `storageReady.ts` and `clamavReady.ts` all carry. This pings the queue Redis
 * directly; it never enqueues a job, never starts a worker, and never touches
 * the app. So a broken producer or a broken worker can never buy itself a skip:
 * with the instance up, the tests RUN, and a failure is a red test — which is
 * the entire point of the test.
 *
 * ⚠️ IN CI THE SKIP PATH IS CLOSED. `ci.yml` provisions a `redis-queue`
 * service, so an unreachable queue there is a defect, not an environment. The
 * caller asserts this is true under `CI` (3.2's rethrow pattern) rather than
 * calling `testInfo.skip()`. Story 2.3 proved an env-gated test can skip
 * silently for a pipeline's entire life, and the epics cite that exact defect
 * when demanding this proof FAIL rather than skip.
 *
 * ⚠️ BOUNDED. ioredis retries forever by default, so an unbounded probe against
 * a down instance hangs the suite instead of reporting "not ready".
 */

let cached: boolean | undefined;

export function queueUrl(): string | undefined {
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // ambient env
  }
  return process.env.REDIS_QUEUE_URL?.trim() || undefined;
}

/** True when the durable queue instance answers PING. */
export async function probeQueueReady(): Promise<boolean> {
  if (cached !== undefined) return cached;
  const url = queueUrl();
  if (!url) {
    cached = false;
    return cached;
  }

  const client = new IORedis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 3000,
    lazyConnect: true,
    retryStrategy: () => null,
  });
  client.on("error", () => {});
  try {
    await client.connect();
    cached = (await client.ping()) === "PONG";
  } catch {
    cached = false;
  } finally {
    client.disconnect();
  }
  return cached;
}
