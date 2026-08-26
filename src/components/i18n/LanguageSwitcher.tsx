"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Endonyms — each language's own name. Rendered as visually-hidden text NEXT TO
 * the visible locale code, so the accessible name is "EN English": the visible
 * label is contained in the accessible name (WCAG 2.5.3 "Label in Name"), voice
 * control can say either, and screen readers announce the full language name.
 */
export const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  tr: "Türkçe",
  ru: "Русский",
};

/** Focus ring per surface — a navy ring on the ink band is invisible (1.32:1). */
const RING = {
  light: "focus-visible:ring-accent focus-visible:ring-offset-2",
  onDark: "focus-visible:ring-white focus-visible:ring-offset-ink focus-visible:ring-offset-2",
} as const;

/** Text colors per surface. `onDark` is required inside `ink` bands (DESIGN.md). */
const TONE = {
  light: { active: "font-semibold text-accent", idle: "text-ink-2 hover:text-ink" },
  onDark: { active: "font-semibold text-white", idle: "text-on-dark-text hover:text-white" },
} as const;

/** `lg` pads each entry to the ≥44px touch floor (mobile menu). */
const SIZE = {
  sm: "",
  lg: "inline-flex min-h-11 min-w-11 items-center justify-center px-2",
} as const;

export interface LanguageSwitcherProps {
  /** Surface the switcher sits on. `onDark` is mandatory inside an `ink` band. */
  tone?: keyof typeof TONE;
  /** `lg` meets the ≥44px touch-target floor. */
  size?: keyof typeof SIZE;
  /**
   * Render as a `<nav>` landmark. Exactly ONE instance per page should be a
   * landmark (the header); secondary instances (footer, mobile menu) opt out so
   * assistive tech doesn't see duplicate identically-named landmarks.
   */
  asLandmark?: boolean;
}

/**
 * Persistent language switcher (Story 1.4). Route-preserving: each entry links to
 * the current route (query included) in that locale via next-intl navigation,
 * which also sets the `NEXT_LOCALE` cookie so the choice persists. Visible label
 * is the locale code per DESIGN ("switcher mono 12").
 */
export function LanguageSwitcher({
  tone = "light",
  size = "sm",
  asLandmark = false,
}: LanguageSwitcherProps) {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("LanguageSwitcher");

  // Preserve the query string across the switch — `usePathname()` is path-only, so
  // filters/pagination (Epic 2) would otherwise be lost. The URL hash is client-only
  // and not present in the SSR'd href, so it is intentionally not carried here.
  const query = searchParams.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  // gap-3 keeps adjacent targets separated at the `sm` size, where the links carry
  // no padding of their own (WCAG 2.5.8 target-spacing exception).
  const list = (
    <ul className="flex items-center gap-3 text-sm">
      {routing.locales.map((loc) => {
        const isActive = loc === activeLocale;
        return (
          <li key={loc}>
            <Link
              href={href}
              locale={loc}
              lang={loc}
              aria-current={isActive ? "page" : undefined}
              className={`${RING[tone]} ${SIZE[size]} font-mono text-xs uppercase tracking-wide focus-visible:outline-none focus-visible:ring-2 ${
                isActive ? TONE[tone].active : TONE[tone].idle
              }`}
            >
              {loc.toUpperCase()}
              <span className="sr-only"> {LOCALE_LABELS[loc]}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );

  // Only the primary (header) instance is a landmark; others are labelled groups.
  return asLandmark ? (
    <nav aria-label={t("label")}>{list}</nav>
  ) : (
    <div role="group" aria-label={t("label")}>
      {list}
    </div>
  );
}
