import { useTranslations } from "next-intl";

/**
 * Localized 404 within a locale segment. Rendered inside `[locale]/layout.tsx`,
 * so the next-intl provider and correct `lang` are already in place.
 */
export default function NotFound() {
  const t = useTranslations("NotFound");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-ink">{t("title")}</h1>
      <p className="text-ink-2">{t("description")}</p>
    </div>
  );
}
