import { connect } from "node:net";

/**
 * Decide whether the attachment-scanning e2e assertions can run (Story 3.7b,
 * AC12).
 *
 * THE ENVIRONMENT, NEVER THE SURFACE — the doctrine `dbReady.ts` and
 * `storageReady.ts` both carry, learned twice the hard way. This asks clamd
 * directly with its own `PING` command; it never issues an HTTP request to the
 * site. So a broken handler can never buy itself a skip: with clamd up, the
 * attachment tests RUN, and a 500 from the endpoint is a red test, which is the
 * entire point of the test.
 *
 * ⚠️ AND IN CI THE SKIP PATH IS CLOSED ENTIRELY. `ci.yml` provisions a clamav
 * service container, so an unreachable clamd there is a defect, not an
 * environment — the caller asserts `probeClamavReady()` is true under `CI`
 * (3.2's rethrow pattern) rather than calling `testInfo.skip()`. Story 2.3
 * proved an env-gated test can skip silently for a pipeline's entire life, and
 * a malware-detection test that skips in the merge gate is indistinguishable
 * from one that passes.
 */

let cached: boolean | undefined;

/** True when clamd answers PING on `CLAMAV_HOST:CLAMAV_PORT`. */
export async function probeClamavReady(): Promise<boolean> {
  if (cached !== undefined) return cached;
  try {
    (process as NodeJS.Process & { loadEnvFile?: (p?: string) => void }).loadEnvFile?.(".env");
  } catch {
    // ambient env
  }

  const host = process.env.CLAMAV_HOST?.trim() || "localhost";
  const port = Number(process.env.CLAMAV_PORT?.trim() || "3310");

  cached = await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.destroy();
      } catch {
        // already closed
      }
      resolve(value);
    };
    // Bounded like every other probe in this suite: an unreachable target must
    // answer "not ready" quickly, never hang the whole run.
    const timer = setTimeout(() => finish(false), 5000);
    const socket = connect({ host, port });
    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (chunk) => finish(chunk.toString("latin1").includes("PONG")));
    socket.on("error", () => finish(false));
    socket.on("close", () => finish(false));
  });

  return cached;
}
