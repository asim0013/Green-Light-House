import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// Absolute path, resolved without `require` (which the lint config forbids) and
// without `import.meta` (which breaks if this config is loaded as CJS). `cwd` is
// the project root during build/dev, and the standalone runtime's root at
// runtime — where `outputFileTracingIncludes` places the handler.
const cacheHandlerPath = path.join(process.cwd(), "cache-handler.js");

const nextConfig: NextConfig = {
  // Standalone output for the Docker runtime image (Dockerfile runner stage).
  output: "standalone",

  // Redis-backed incremental cache (Story 1.8). `cacheHandler` is the SINGULAR,
  // still-current option that backs `unstable_cache`; the plural `cacheHandlers`
  // is only for `use cache`, which needs `cacheComponents: true` — incompatible
  // with the `force-dynamic` that keeps builds database-free.
  cacheHandler: cacheHandlerPath,

  // Disable the default in-memory layer so every read goes through the handler.
  // Without this, an in-process LRU answers first and the cache is neither
  // shared between instances nor observable in Redis — which would make the
  // story's "cached data survives a restart" proof vacuous.
  cacheMaxMemorySize: 0,

  // `output: "standalone"` traces the app bundle; a handler resolved by PATH at
  // runtime is invisible to that trace and would be missing from the container.
  outputFileTracingIncludes: {
    "/**": ["./cache-handler.js"],
  },
};

// next-intl plugin — points at the request config that loads per-locale messages.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
