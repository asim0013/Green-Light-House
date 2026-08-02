import { useTranslations } from "next-intl";

/**
 * Localized 404 within a locale segment. Rendered inside `[locale]/layout.tsx`,
 * so the next-intl provider and correct `lang` are already in place.
 */
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="text-zinc-600 dark:text-zinc-400">{t("description")}</p>
    </main>
  );
}
