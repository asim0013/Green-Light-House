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

  // Enables `app/global-not-found.tsx` (Story 1.9). Still experimental in 16.2.12,
  // and adopted deliberately: this app's root layout is a TOP-LEVEL DYNAMIC SEGMENT
  // (`app/[locale]/layout.tsx`), which Next's own docs name as the case where a 404
  // cannot be composed from `layout.js` + `not-found.js`. Measured here: with a
  // catch-all instead, the 404 renders in a bare `<html id="__next_error__">` with
  // no `lang` and no chrome — the WCAG 3.1.1 defect Story 1.9 exists to close.
  experimental: { globalNotFound: true },

  // Redis-backed incremental cache (Story 1.8). `cacheHandler` is the SINGULAR,
  // still-current option that backs `unstable_cache`; the plural `cacheHandlers`
  // is only for `use cache`, which needs `cacheComponents: true` — incompatible
  // with the `force-dynamic` that keeps builds database-free.
  cacheHandler: cacheHandlerPath,

  // Belt-and-braces, and INERT on today's code path — kept deliberately.
  // A configured singular `cacheHandler` replaces `FileSystemCache` outright, so
  // there is no in-process LRU left for this to disable; entries reach Redis
  // because the handler IS the only cache, not because of this line. (An earlier
  // comment here claimed otherwise, and the AC1 "survives a restart" argument was
  // written as if it rested on this setting. It does not.)
  // It starts mattering the moment `use cache` is adopted, so it stays at 0.
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
