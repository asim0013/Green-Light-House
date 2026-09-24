import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { absoluteUrl, alternatesFor, isIndexable } from "@/lib/seo";
import { listIndustries } from "@/server/repositories/industry";
import { listManufacturers } from "@/server/repositories/manufacturer";
import { listTopLevelCategories } from "@/server/repositories/category";
import { listPublishedProjects } from "@/server/repositories/project";
import {
  getIndustryPageData,
  industrySignals,
  industriesIndexSignals,
  industryHref,
} from "@/server/industry-page";
import { listCategoryTree } from "@/server/repositories/category";
import { catalogSignals } from "@/server/catalog-page";
import { listProductSignals } from "@/server/repositories/product";
import { signalsFromRow, productHref } from "@/server/product-page";
import { listServices } from "@/server/repositories/service";
import { servicesSignals } from "@/server/services-page";
import { rfqSignals } from "@/server/rfq-page";
import { contactSignals } from "@/server/contact-page";
import { getContactDetails } from "@/server/repositories/site-settings";
import { projectsIndexSignals, projectSignals, projectHref } from "@/server/project-page";
import { isValidSlug } from "@/lib/slug";

/**
 * `/sitemap.xml` (Story 1.9 — FR42, FR42a).
 *
 * NOT NEGOTIABLE — do not remove this line. `app/sitemap.ts` compiles to a Route
 * Handler that Next CACHES BY DEFAULT, which means it is evaluated during
 * `next build`. Because this file reads the database, that would break the hard
 * constraint carried from Story 1.3 that a build must never require Postgres.
 * Measured, not assumed: without it, `npm run build` with Postgres stopped fails
 * with `Error occurred prerendering page "/sitemap.xml"` and exits 1; with it, the
 * same build succeeds and the route is listed as `ƒ` and absent from
 * `.next/prerender-manifest.json`.
 */
export const dynamic = "force-dynamic";

/**
 * Scope: the three locale homepages, the `/industries` index and every INDEXABLE
 * `/industries/<slug>` (Story 2.1), `/products` and every indexable
 * `/products/<slug>` (2.2/2.4), `/services` (2.6), `/projects` plus every
 * indexable `/projects/<slug>` (Story 3.1), and `/rfq` in ALL THREE locales
 * (Story 3.2 — its content is messages-complete by construction, the first
 * surface whose tr/ru index from day one).
 *
 * ⚠️ `/contact` (Story 3.8) IS WIRED BUT DELIBERATELY ABSENT TODAY. It is a
 * SELF-LIFTING omission, not a permanent one: `contactSignals` reports
 * `isPlaceholder` while GLH has supplied no address, email or registration
 * details, so the page is `noindex` AND unlisted from the same single fact —
 * the `/privacy` pattern. Supplying the values in `src/config/contact.ts`
 * publishes it here with no code change, which is why the emitter is gated
 * rather than commented out.
 *
 * The nav and footer in `src/config/site.ts` still point at About and the legal
 * pages, which do not exist until Epic 5 — listing them would publish a sitemap
 * of 404s. `/privacy` DOES exist (the 3.2 consent stub) and is deliberately
 * absent here: it is a noindex placeholder (`isPlaceholder` — see its page),
 * and this omission and its robots tag follow from that same fact. Each later
 * story extends the loop below as its surface lands.
 *
 * FR42a ("the sitemap lists only populated pages") is enforced with the SAME
 * predicate the page's `robots` metadata uses — `isIndexable` for the collection
 * pages, and `industrySignals` from `@/server/industry-page` for the industry
 * pages, which is the very function that route's `generateMetadata` calls. One
 * source of truth per surface, so a page can never be `noindex` while the sitemap
 * still advertises it.
 *
 * All reads go through repositories, never Prisma directly (architecture
 * § Architectural Boundaries), and each is cached in Redis by Story 1.8.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // The three locales are independent — read them concurrently rather than
  // awaiting each in turn, which tripled this route's latency for no reason.
  // Story 4.8: the contact/legal VALUES now come from the admin-editable
  // `SiteSettings` row (config fallback), read ONCE — they are locale-invariant.
  // The APPROVAL gates stay code-flipped inside this object, so filling values in
  // admin cannot self-list /contact in the sitemap. Same object the page's
  // generateMetadata builds from, so the two cannot drift (FR42a).
  const contact = await getContactDetails();
  const perLocale = await Promise.all(
    routing.locales.map(async (locale) => {
      const [
        projects,
        industries,
        categories,
        manufacturers,
        categoryTree,
        productRows,
        services,
        allProjects,
      ] = await Promise.all([
        listPublishedProjects(locale, 1),
        listIndustries(locale),
        listTopLevelCategories(locale),
        listManufacturers(locale),
        // One tree read is the WHOLE catalog gate (Story 2.2): catalogSignals is
        // deliberately tree-only, so /products costs no per-product reads here.
        listCategoryTree(locale),
        // ONE query for every published product (Story 2.4 decision Q3). A
        // per-product read would make /sitemap.xml scale with the catalogue,
        // repeating the industry N+1 already deferred above — and React cache()
        // cannot rescue it, being INERT in Route Handlers (measured, Story 2.1).
        listProductSignals(locale),
        // The Services page's own read (Story 2.6) — one query, and the SAME
        // predicate its generateMetadata calls.
        listServices(locale),
        // ⚠️ A SEPARATE, FULL read for the Projects surfaces (Story 3.1) — NOT
        // the `listPublishedProjects(locale, 1)` above. The limit is part of the
        // cache key, so that entry holds at most ONE row: reusing it would report
        // `itemCount: 1` forever and emit exactly one project URL. That read is
        // the HOMEPAGE indexability signal and nothing else.
        //
        // One query per locale, and per-project signals are computed from these
        // rows — no per-project page read, so `/sitemap.xml` does not scale with
        // the project count the way the per-industry N+1 above still does.
        listPublishedProjects(locale),
      ]);

      // ⚠️ THE SLA IS DELIBERATELY ABSENT FROM THIS ARRAY (Story 3.5), and the
      // note belongs HERE as much as on the page. `[locale]/page.tsx` computes
      // the same predicate for the homepage, and the robots side and the sitemap
      // side have silently drifted THREE times in this project (1.9, the 2.1
      // review, the 2.4 review). Since 3.5 the SLA is DB content with per-locale
      // rows, so it COULD be counted here — it must not be. It is site-wide
      // chrome rendered identically across nine render sites, and a fully-translated
      // chrome element must never be the evidence that a THIN page deserves
      // indexing: with EN-only collections plus one translated SLA row the
      // arithmetic would advertise `/tr` and `/ru` as indexable while they still
      // render English.
      const translated = [...projects, ...industries, ...categories, ...manufacturers];
      const collectionsIndexable = isIndexable({
        locale,
        itemCount: translated.length,
        fallbackFields: translated.filter((row) => row.isFallback).length,
        totalFields: translated.length,
      });

      // Per-industry indexability, computed with the page's own function so the two
      // cannot drift. Concurrent across industries for the same reason as above.
      const industrySlugs = await Promise.all(
        industries.map(async (industry) => {
          const data = await getIndustryPageData(industry.slug, locale);
          if (!data) return null;
          return isIndexable(industrySignals(locale, data)) ? industry.slug : null;
        }),
      );

      return {
        locale,
        collectionsIndexable,
        // The `/industries` index is gated by the index page's OWN predicate — the
        // same function its generateMetadata calls — not by whether the landing
        // pages happen to be indexable. Those are different surfaces: an index
        // listing six sectors is real content even when every sector page is thin.
        // Gating it on the landing pages made the page say `index, follow` while
        // the sitemap silently omitted it.
        indexIndexable: isIndexable(industriesIndexSignals(locale, industries)),
        // The catalog gate — the SAME function /products generateMetadata calls
        // (one predicate per surface). Category-filtered views canonical to clean
        // /products, so the sitemap grows by exactly this one URL per locale.
        catalogIndexable: isIndexable(catalogSignals(locale, categoryTree)),
        // One predicate per surface: `servicesSignals` is what /services' robots
        // metadata uses, so page and sitemap cannot disagree.
        servicesIndexable: isIndexable(servicesSignals(locale, services)),
        // One predicate per surface (Story 3.2): constant-indexable — see
        // `rfqSignals` for why /rfq cannot be thin — but routed through the
        // SAME predicate the page's robots metadata calls, never hard-coded.
        rfqIndexable: isIndexable(rfqSignals(locale)),
        // Story 3.8/4.8. ⚠️ SELF-LIFTING: /contact is `isPlaceholder` until the
        // admin supplies the required VALUES *and* a human flips the code-side
        // `translationsReviewed` gate — so filling values alone leaves it absent
        // here AND noindex, the same single fact driving both, exactly as /privacy
        // does. `contact` (the row + code approvals) is the SAME object the page's
        // generateMetadata builds from, so the two cannot drift.
        contactIndexable: isIndexable(contactSignals(locale, contact)),
        // One predicate per surface (Story 3.1): `projectsIndexSignals` is what
        // /projects' robots metadata uses. On today's seed this is TRUE for en/tr
        // and FALSE for ru — zero `ru` project translations means every row falls
        // back and the page is fallback-only. Page and sitemap agree by construction.
        projectsIndexable: isIndexable(projectsIndexSignals(locale, allProjects)),
        // Per-project gates from the SAME function the detail page calls, computed
        // from the batched rows above. `isValidSlug` filters AT THE DATA SOURCE:
        // the sitemap does no XML escaping, so a slug that could break the document
        // must never reach the emitter (the gate Story 2.4 added for products).
        indexableProjectSlugs: allProjects
          .filter((project) => isValidSlug(project.slug))
          .filter((project) => isIndexable(projectSignals(locale, project)))
          .map((project) => project.slug),
        // Per-product gates from the SAME function the detail page metadata calls
        // (signalsFromRow / signalsFromPageData both delegate to productSignals),
        // computed from the batched rows — no extra read per product.
        indexableProductSlugs: productRows
          .filter((row) => isIndexable(signalsFromRow(locale, row)))
          .map((row) => row.slug),
        indexableIndustrySlugs: industrySlugs.filter((slug): slug is string => slug !== null),
      };
    }),
  );

  // INCLUSION is gated by indexability (FR42a: "the sitemap lists only populated
  // pages"). The hreflang map is NOT — it comes from the same `alternatesFor`
  // the page metadata uses, so the two can never advertise different alternate
  // sets for the same URL. An earlier version built a filtered map here and also
  // dropped `x-default`, which made page and sitemap disagree.
  const entry = (locale: (typeof routing.locales)[number], href: string) => ({
    url: absoluteUrl(locale, href),
    alternates: { languages: alternatesFor(locale, href).languages },
  });

  return perLocale.flatMap(
    ({
      locale,
      collectionsIndexable,
      indexIndexable,
      catalogIndexable,
      indexableIndustrySlugs,
      indexableProductSlugs,
      servicesIndexable,
      rfqIndexable,
      contactIndexable,
      projectsIndexable,
      indexableProjectSlugs,
    }) => [
      ...(collectionsIndexable ? [entry(locale, "/")] : []),
      ...(indexIndexable ? [entry(locale, "/industries")] : []),
      ...(catalogIndexable ? [entry(locale, "/products")] : []),
      ...(servicesIndexable ? [entry(locale, "/services")] : []),
      ...(rfqIndexable ? [entry(locale, "/rfq")] : []),
      ...(contactIndexable ? [entry(locale, "/contact")] : []),
      ...(projectsIndexable ? [entry(locale, "/projects")] : []),
      // `industryHref`, not a template literal: Next does NOT escape sitemap URLs,
      // so an unencoded `&` or `<` in a slug makes the WHOLE FILE malformed XML.
      ...indexableIndustrySlugs.map((slug) => entry(locale, industryHref(slug))),
      // , not a template literal — same XML-escaping reason.
      ...indexableProductSlugs.map((slug) => entry(locale, productHref(slug))),
      // `projectHref`, not a template literal — same XML-escaping reason (Story 3.1).
      ...indexableProjectSlugs.map((slug) => entry(locale, projectHref(slug))),
    ],
  );
}
