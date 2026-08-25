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

const client = createClient({ url });
client.on("error", () => {});

try {
  await client.connect();
} catch {
  console.error(`Could not reach Redis at ${url}.`);
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
