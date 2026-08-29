import { cache } from "react";
import type { Locale } from "@prisma/client";
import { listServices, type ServiceListItem } from "@/server/repositories/service";
import type { ContentSignals } from "@/lib/seo";

/**
 * Everything the Services page reads, in ONE place (Story 2.6 — FR23).
 *
 * A server module rather than helpers inside the route, for the reason
 * `industry-page.ts` and `product-page.ts` give: `sitemap.ts` needs the
 * IDENTICAL indexability predicate. A `noindex` page still advertised in the
 * sitemap is the mixed signal FR42a exists to prevent, and these two sides have
 * silently drifted THREE times in this project (1.9, the 2.1 review's
 * `/industries` index, and the 2.4 review's product signals).
 */

/**
 * The page's single read, memoised for the REQUEST.
 *
 * `generateMetadata` and the body both need it and Next runs them as separate
 * calls; Story 1.8's `cached()` makes the read cheap ACROSS requests but does
 * not deduplicate WITHIN one. React's `cache()` is request-scoped, so the second
 * caller gets the first's promise. Primitive argument only — an options object
 * would never be `===` between the two call sites and the memo would silently
 * never hit (the 2.4 review's lesson).
 */
export const getServicesPageData = cache(async (locale: Locale): Promise<ServiceListItem[]> => {
  return listServices(locale);
});

/**
 * FR42a's thin-content signals for `/services`.
 *
 * `itemCount` is the number of services the page actually renders: zero
 * services is a real page (it still offers the RFQ and the phone) but it is not
 * a page worth indexing.
 *
 * The FALLBACK signals count the services themselves, because on this surface
 * the service names and descriptions ARE the content.
 *
 * ⚠️ THE SLA IS NOT COUNTED, and since Story 3.5 that is a real choice rather
 * than an absence of options: the process card became DB content with its own
 * per-locale rows, so it COULD be counted. It must not be. With five EN-only
 * services plus one fully-translated SLA row the arithmetic would flip
 * `/tr/services` and `/ru/services` to `index, follow` while they still render
 * five English cards — a page advertised as Turkish that is not. The SLA is
 * chrome on every route; it cannot be evidence that THIS page has content.
 *
 * On the current seed every service is EN-only,
 * so `/tr/services` and `/ru/services` are fallback-only ⇒ `noindex` ⇒ absent
 * from the sitemap. That is correct, not a bug: those pages have nothing in the
 * requested language yet, and the visible FallbackNotice says so to the reader.
 */
export function servicesSignals(
  locale: Locale,
  services: readonly ServiceListItem[],
): ContentSignals {
  return {
    locale,
    itemCount: services.length,
    fallbackFields: services.filter((service) => service.isFallback).length,
    totalFields: services.length,
  };
}
