#!/usr/bin/env node
/**
 * Empty the Next incremental cache — and NOTHING else.
 *
 * REPLACES `redis-cli FLUSHALL`, which was this project's standing pre-proof
 * ritual across eight story records. That was safe only while Redis held one
 * thing. From Story 3.3 a second Redis backs BullMQ, and FR29 ("no inquiry is
 * ever lost") depends on it — and FLUSHALL is INSTANCE-wide, so neither a
 * separate database index nor a key prefix would have protected the queue. The
 * instances are now separate (Story 3.0), which means a stray FLUSHALL against
 * the wrong URL is the remaining way to lose queued jobs. This script cannot do
 * that: it deletes by prefix, on the cache URL only.
 *
 *   npm run cache:flush
 *
 * Prefixes come from `cache-handler.js`. Verified at the time of writing that
 * `glh:cache:*` and `glh:tag:*` were 100% of the live keyspace — but this deletes
 * only what it matches, so a future prefix simply survives rather than being
 * silently destroyed.
 *
 * SCAN, not KEYS: KEYS blocks the server for the whole sweep. At current scale
 * either would work; SCAN is correct at any scale and costs nothing to prefer.
 */
import { createClient } from "redis";

const PREFIXES = ["glh:cache:*", "glh:tag:*"];

// ⚠️ THIS SCRIPT MUST LOAD `.env` ITSELF (Story 3.0 code review).
//
// It shipped reading `process.env.REDIS_URL` under a bare `node scripts/...`
// invocation. Node does not auto-load `.env`, so `npm run cache:flush` — the
// only invocation documented anywhere — always exited 1 with "REDIS_URL is not
// set" and deleted nothing. It went unnoticed because every OTHER consumer of
// REDIS_URL in this repo (Next, Prisma) loads `.env` on its own.
//
// Loading it here rather than adding `--env-file` to the npm script keeps the
// script correct however it is invoked, including directly.
//
// Shell values win over the file: an operator who writes
// `REDIS_URL=... node scripts/cache-flush.mjs` to target a specific instance must
// not have `.env` silently override them. Captured before the load and restored
// after, rather than relying on remembering Node's precedence rules.
const fromShell = {
  REDIS_URL: process.env.REDIS_URL,
  REDIS_QUEUE_URL: process.env.REDIS_QUEUE_URL,
};
try {
  process.loadEnvFile();
} catch {
  // No .env — fall through to the guard below, which says something useful.
}
for (const [key, value] of Object.entries(fromShell)) {
  if (value) process.env[key] = value;
}

const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL is not set — refusing to guess which Redis to empty.");
  process.exit(1);
}
if (process.env.REDIS_QUEUE_URL && process.env.REDIS_QUEUE_URL === url) {
  console.error(
    "REDIS_URL and REDIS_QUEUE_URL point at the SAME instance. Refusing to run:\n" +
      "the queue is durable and must never share an instance with the disposable cache.",
  );
  process.exit(1);
}

// ⚠️ THE SOCKET OPTIONS ARE LOAD-BEARING (Story 3.0 code review).
//
// Without them this script HUNG FOREVER against a stopped Redis, printing
// nothing — measured: still pending at 30s. node-redis's default
// reconnectStrategy returns a delay for every cause except SocketTimeoutError,
// so on ECONNREFUSED `connect()` re-arms indefinitely and NEVER SETTLES: it
// neither resolves nor rejects, which made the `catch` below unreachable dead
// code. `cache-handler.js:19-27` documents this exact node-redis behaviour and
// :95-105 carries the fix; this is the same fix, minus the mid-life healing
// (a one-shot CLI has no life to heal).
//
// `createClient` is INSIDE the try because it throws SYNCHRONOUSLY on an
// unparseable URL — the same trap cache-handler.js:123 records.
let client;
try {
  client = createClient({
    url,
    socket: {
      connectTimeout: 3000,
      // Returning `false` is what makes connect() REJECT rather than hang.
      reconnectStrategy: (retries) => (retries >= 3 ? false : Math.min(retries * 100, 500)),
    },
  });
  // Rate-limited, not silenced: a listener is required or node-redis escalates
  // connection errors to an unhandled exception.
  client.on("error", () => {});
  await client.connect();
} catch (error) {
  console.error(`Could not reach Redis at ${url}. ${error?.message ?? error}`);
  process.exit(1);
}

let deleted = 0;
for (const match of PREFIXES) {
  for await (const keys of client.scanIterator({ MATCH: match, COUNT: 500 })) {
    const batch = Array.isArray(keys) ? keys : [keys];
    if (batch.length === 0) continue;
    deleted += await client.del(batch);
  }
}

await client.quit();
console.log(`cache:flush — deleted ${deleted} key(s) matching ${PREFIXES.join(" , ")}`);
