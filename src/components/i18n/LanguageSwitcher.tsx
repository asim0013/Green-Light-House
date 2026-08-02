"use client";

import { useLocale, useTranslations } from "next-intl";
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

/**
 * Persistent language switcher (Story 1.4). Route-preserving: each entry links to
 * the current route in that locale via next-intl navigation, which also sets the
 * `NEXT_LOCALE` cookie so the choice persists. Story 1.6 embeds this in the real
 * global nav; the temporary placement lives in `[locale]/layout.tsx` for now.
 */
export function LanguageSwitcher() {
  const activeLocale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("LanguageSwitcher");

  return (
    <nav aria-label={t("label")}>
      <ul className="flex items-center gap-3 text-sm">
        {routing.locales.map((loc) => {
          const isActive = loc === activeLocale;
          return (
            <li key={loc}>
              <Link
                href={pathname}
                locale={loc}
                lang={loc}
                aria-current={isActive ? "true" : undefined}
                className={
                  isActive
                    ? "font-semibold text-zinc-900 underline underline-offset-4 dark:text-zinc-50"
                    : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
                }
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
