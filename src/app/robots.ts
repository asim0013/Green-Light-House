import type { MetadataRoute } from "next";
import { allowsIndexing, siteOrigin } from "@/lib/seo";

/**
 * `/robots.txt` (Story 1.9).
 *
 * No `dynamic` export on purpose — unlike `sitemap.ts` this reads no database, so
 * letting Next prerender it at build time is correct and costs nothing.
 *
 * FAILS CLOSED per environment. `SITE_ALLOW_INDEXING` must be exactly `"true"` for
 * crawling to be allowed; anything else disallows everything. The deployment target
 * is self-hosted containers across several environments and the production domain
 * is still an open question upstream, so there is no host to compare against — an
 * explicit opt-in is the only honest gate. A staging container that inherits a
 * permissive robots.txt is the standard way a duplicate of the entire site ends up
 * in an index.
 *
 * `/api` is disallowed even when indexing is allowed: `POST /api/revalidate` is not
 * a page and has nothing to offer a crawler.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();

  if (!allowsIndexing()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [{ userAgent: "*", allow: "/", disallow: "/api" }],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
