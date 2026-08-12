import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Kicker } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";

/**
 * The unknown-slug body (Story 2.1, Task 0 — option E).
 *
 * WHY THIS IS A PAGE BODY AND NOT `notFound()`. Every option was measured on this
 * codebase before choosing; none delivers a 404 status AND correct chrome:
 *
 *   (A) plain `notFound()`            404 ✓  lang ✗  chrome ✗  — bare <html id="__next_error__">
 *   (B) notFound() + loading boundary 200 ✗  lang ✓  chrome ✓
 *   (C) proxy validation + rewrite    404 ✓  lang ✗  chrome ✗  — a rewrite never reaches
 *                                                                 global-not-found; it lands on
 *                                                                 the [locale] boundary instead
 *   (D) dynamicParams = false         ruled out: needs generateStaticParams, which needs
 *                                     Postgres at build (AC8 forbids it)
 *   (E) THIS — in-layout body         200    lang ✓  chrome ✓
 *   (F) not-found declaring its own <html>   404 ✓  lang ✗  chrome ✗ — Next overrides the
 *                                     document; only the error shell's <html> survives
 *
 * So the real trade is STATUS CODE vs ACCESSIBILITY, and accessibility wins: a
 * missing `lang` is a WCAG 3.1.1 Level A failure that Story 1.9 exists to close,
 * and the bare shell also dead-ends the user with no nav, no footer and no route to
 * an RFQ — which EXPERIENCE.md forbids. Shipping (A) would make
 * `/en/industries/typo` WORSE than `/en/typo` is today.
 *
 * The cost is a soft 404, and it is contained: the page sets `robots: noindex`
 * explicitly (Next only injects that automatically for a real 404 status), and the
 * sitemap lists real slugs only. Recorded as deferred work — if Next ever renders
 * not-found boundaries inside the root layout, or this app gains a static root
 * layout, switching to (A) is a one-line change.
 */
export function IndustryNotFound() {
  const t = useTranslations("Industry");
  const tNav = useTranslations("Nav");

  return (
    <section className="bg-surface">
      <div className={`${CONTAINER} py-16 md:py-24`}>
        <Kicker tone="ink">{t("notFoundKicker")}</Kicker>
        <h1 className="mt-3 font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
          {t("notFoundTitle")}
        </h1>
        <p className="mt-5 max-w-[62ch] text-[17px] leading-relaxed text-ink-2">
          {t("notFoundLead")}
        </p>

        {/* EXPERIENCE.md: a "nothing here" state must offer a way onward, never
            dead-end. Both of these lead somewhere that exists today. */}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link href="/industries" className={buttonClasses("primary")}>
            {t("notFoundBackToIndustries")}
          </Link>
          <a
            href={`tel:${SITE.phone}`}
            aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-data text-[15px] text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <Phone size={16} aria-hidden />
            {SITE.phoneDisplay}
          </a>
        </div>
      </div>
    </section>
  );
}
