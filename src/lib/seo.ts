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
  return raw.replace(/\/+$/, "");
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
  /** A route that exists but holds no real content yet (e.g. the catch-all). */
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
 * honest gate: staging inheriting a permissive robots.txt is the standard way a
 * duplicate of the whole site ends up in an index.
 */
export function allowsIndexing(): boolean {
  return process.env.SITE_ALLOW_INDEXING?.trim().toLowerCase() === "true";
}
