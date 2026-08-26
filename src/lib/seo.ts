import type { Locale } from "next-intl";
import { getPathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * SEO primitives (Story 1.9) — FR42, FR42a, NFR4.
 *
 * One module owns three things that must never disagree:
 *   1. the absolute origin every canonical / hreflang / sitemap URL is built from,
 *   2. how a locale + path becomes an absolute URL,
 *   3. whether a page is thin (FR42a), which gates BOTH its `noindex` metadata and
 *      its presence in the sitemap.
 *
 * (3) is deliberately a single function. If page metadata and sitemap.ts each
 * decided indexability for themselves they would drift, and the failure is silent:
 * a page that says `noindex` while the sitemap still advertises it is exactly the
 * mixed signal FR42a exists to prevent.
 */

/** Used only when SITE_URL is unset — i.e. local development. */
const DEV_ORIGIN = "http://localhost:3000";

/**
 * The absolute origin, WITHOUT a trailing slash.
 *
 * Server-only and read at REQUEST time, deliberately. The obvious alternative,
 * `NEXT_PUBLIC_SITE_URL`, is inlined at BUILD time — and `Dockerfile` runs
 * `npm run build` with no `ARG`/`ENV` for it, so the container image would bake
 * `localhost:3000` into every canonical tag on the site. Every surface that calls
 * this is server-rendered, so a runtime read costs nothing.
 */
export function siteOrigin(): string {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return DEV_ORIGIN;

  const normalized = raw.replace(/\/+$/, "");
  try {
    new URL(normalized);
  } catch {
    // Deliberately fail LOUD rather than falling back. A silent default would
    // ship wrong canonical and hreflang URLs across the whole site, which is far
    // worse and far harder to notice than a boot failure. The bare
    // `TypeError: Invalid URL` this replaces did not say which variable was at
    // fault, and it surfaced from the root layout's generateMetadata.
    throw new Error(
      `SITE_URL is not a valid absolute URL: ${JSON.stringify(raw)}. ` +
        `It must include a scheme, e.g. "https://greenlighthouse.example".`,
    );
  }
  return normalized;
}

/**
 * Absolute URL for `href` in `locale`.
 *
 * Always via next-intl's `getPathname`, never string concatenation: the locale
 * prefix strategy lives in `src/i18n/routing.ts`, and hand-built `/${locale}${href}`
 * would silently desync canonical from sitemap the moment `localePrefix` or
 * `pathnames` changes.
 */
export function absoluteUrl(locale: Locale, href: string): string {
  return `${siteOrigin()}${getPathname({ locale, href })}`;
}

/**
 * `alternates` for a page: a SELF canonical plus every locale and `x-default`.
 *
 * Self-canonical per locale is deliberate — FR42a says canonicals are set "per
 * language". Pointing TR/RU at EN would de-index the Turkish and Russian trees,
 * which is the opposite of what hreflang is for.
 *
 * The language map is NOT gated by indexability, per the story's recorded Q3
 * decision: every route renders in all three locales (FR34a forbids rendering
 * empty), so all three URLs resolve, and `noindex` — not a missing hreflang — is
 * what keeps a thin one out of the index. `sitemap.ts` reuses THIS function for
 * exactly that reason: an earlier version built its own filtered map, which made
 * the page and the sitemap advertise different alternate sets for the same URLs.
 */
export function alternatesFor(locale: Locale, href: string) {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = absoluteUrl(l, href);
  languages["x-default"] = absoluteUrl(routing.defaultLocale, href);

  return { canonical: absoluteUrl(locale, href), languages };
}

/** FR42a's three disjunctive triggers. */
export type ThinReason = "empty" | "placeholder" | "fallback-only";

export interface ContentSignals {
  locale: Locale;
  /** Primary content items the page actually renders. Zero ⇒ empty. */
  itemCount: number;
  /**
   * A route that exists but holds no real content yet — e.g. an Epic 2 category
   * page shipped before its products are loaded. One caller passes it today:
   * the `/privacy` consent stub (Story 3.2), which is a placeholder BY INTENT.
   */
  isPlaceholder?: boolean;
  /** Of the page's primary translatable fields, how many resolved via EN fallback. */
  fallbackFields?: number;
  totalFields?: number;
}

/**
 * Why this page is thin, or `null` if it is not.
 *
 * The fallback rule is the one the PRD leaves open: FR34a is field-level, the
 * resolver is row-level, and "3 of 5 fields fell back" is undefined. Story
 * decision (Q4): thin only when EVERY primary field fell back — a page with any
 * genuine locale content is worth indexing in that locale. Partial fallback still
 * shows the visible "shown in English" notice; it just is not a reason to hide the
 * page from search.
 */
export function thinContentReason(signals: ContentSignals): ThinReason | null {
  const { locale, itemCount, isPlaceholder, fallbackFields, totalFields } = signals;

  // Checked first so the reported reason is stable for a placeholder that also
  // happens to have nothing in it.
  if (isPlaceholder) return "placeholder";
  if (itemCount <= 0) return "empty";

  // EN is the source language; it cannot be a fallback of itself.
  if (locale !== routing.defaultLocale && totalFields && totalFields > 0) {
    if ((fallbackFields ?? 0) >= totalFields) return "fallback-only";
  }

  return null;
}

export function isIndexable(signals: ContentSignals): boolean {
  return thinContentReason(signals) === null;
}

/**
 * The `robots` metadata field.
 *
 * `follow` stays true even when `index` is false: a thin page's outbound links are
 * still worth crawling, and blocking them would strand whatever it links to.
 */
export function robotsFor(signals: ContentSignals): { index: boolean; follow: boolean } {
  return { index: isIndexable(signals), follow: true };
}

/**
 * Whether THIS deployment may be crawled at all.
 *
 * Fails closed. The deployment target is self-hosted containers across several
 * environments, and the production domain is still an open question upstream — so
 * there is no host string to compare against. An explicit opt-in is the only
 * honest gate.
 *
 * Accepts `true` case-insensitively, after trimming — so `TRUE`, `True` and
 * `" true "` all opt in. Anything else, including unset, does not.
 *
 * NOTE ON WHAT THIS BUYS: a disallow-all robots.txt stops crawling, NOT
 * indexation. A staging URL that is linked from somewhere public can still be
 * indexed URL-only (Google may list the bare URL with no snippet). Treat this as
 * one layer; real isolation is HTTP auth or a network boundary.
 */
export function allowsIndexing(): boolean {
  return process.env.SITE_ALLOW_INDEXING?.trim().toLowerCase() === "true";
}
