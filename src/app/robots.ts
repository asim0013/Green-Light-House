import type { MetadataRoute } from "next";
import { allowsIndexing, siteOrigin } from "@/lib/seo";

/**
 * `/robots.txt` (Story 1.9).
 *
 * DYNAMIC ON PURPOSE — do not remove. An earlier version omitted this on the
 * grounds that the route "reads no database, so prerendering is correct". That is
 * the wrong criterion: it reads runtime ENV (`SITE_ALLOW_INDEXING`, `SITE_URL`),
 * which is just as much a reason to stay out of the build. Measured: building with
 * `SITE_ALLOW_INDEXING=true` bakes the whole allow-branch into
 * `.next/server/app/robots.txt.body`. That artifact happened never to be served —
 * but only because Story 1.8's custom `cacheHandler` displaces `FileSystemCache`
 * and then refuses `APP_ROUTE` entries. In other words this file was correct by
 * coincidence, via an unrelated caching decision that could be reverted at any
 * time. `force-dynamic` makes it correct by construction.
 *
 * FAILS CLOSED per environment: `SITE_ALLOW_INDEXING` must be `true`
 * (case-insensitive, trimmed) for crawling to be allowed. The deployment target is
 * self-hosted containers across several environments and the production domain is
 * still an open question upstream, so there is no host to compare against — an
 * explicit opt-in is the only honest gate.
 *
 * Note what a disallow-all does and does not buy: it stops CRAWLING, not
 * INDEXATION. A staging URL linked from somewhere public can still be indexed
 * URL-only. This is one layer, not isolation.
 *
 * `/api` is disallowed even when indexing is allowed: `POST /api/revalidate` is
 * not a page and has nothing to offer a crawler.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  const origin = siteOrigin();

  // The `Sitemap:` line is emitted in BOTH branches. A `Disallow: /` alongside a
  // sitemap reference is valid robots.txt, and it keeps AC4's "robots.txt
  // references the sitemap" literally true in every environment rather than only
  // in the one configuration no gate exercises.
  return allowsIndexing()
    ? {
        rules: [{ userAgent: "*", allow: "/", disallow: "/api" }],
        sitemap: `${origin}/sitemap.xml`,
        host: origin,
      }
    : {
        rules: [{ userAgent: "*", disallow: "/" }],
        sitemap: `${origin}/sitemap.xml`,
      };
}
