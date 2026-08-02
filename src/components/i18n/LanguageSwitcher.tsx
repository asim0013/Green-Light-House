"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/**
 * Endonyms — each language shown in its own name. These are language-neutral
 * literals (English is always "English", etc.), so they are NOT translated per
 * UI locale; the switcher's accessible group label IS localized (via messages).
 */
const LOCALE_LABELS: Record<(typeof routing.locales)[number], string> = {
  en: "English",
  tr: "Türkçe",
  ru: "Русский",
};

const LINK_BASE =
  "rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-900";

/**
 * Persistent language switcher (Story 1.4). Route-preserving: each entry links to
 * the current route in that locale via next-intl navigation, which also sets the
 * `NEXT_LOCALE` cookie so the choice persists. Story 1.6 embeds this in the real
 * global nav; the temporary placement lives in `[locale]/layout.tsx` for now.
 */
export function LanguageSwitcher() {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const t = useTranslations("LanguageSwitcher");

  // Preserve the query string across the switch — `usePathname()` is path-only, so
  // filters/pagination (Epic 2) would otherwise be lost. The URL hash is client-only
  // and not present in the SSR'd href, so it is intentionally not carried here.
  const query = searchParams.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <nav aria-label={t("label")}>
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
                className={`${LINK_BASE} ${
                  isActive
                    ? "font-semibold text-zinc-900 underline underline-offset-4 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }`}
              >
                {LOCALE_LABELS[loc]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
