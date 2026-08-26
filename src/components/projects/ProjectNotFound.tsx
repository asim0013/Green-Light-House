import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Kicker } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { SITE } from "@/config/site";

/**
 * The unknown-or-unpublished project body (Story 3.1) — the SAME decision Story
 * 2.1 settled for industries and 2.4 for products, so the three detail routes
 * behave identically rather than each inventing its own 404. See
 * `IndustryNotFound` for the full option table; the short version is that no
 * option delivers a 404 STATUS *and* correct `lang` + chrome on this codebase, so
 * the trade is status code vs WCAG 3.1.1 Level A, and accessibility wins.
 *
 * The soft 404 is contained: the page sets `robots: { index: false }` explicitly
 * (Next injects that automatically only for a real 404 STATUS), emits no canonical
 * and no hreflang, and the sitemap lists real published slugs only.
 *
 * A DRAFT PROJECT LANDS HERE TOO, with deliberately identical copy: "not published
 * yet" is exactly what a draft is, and saying anything more specific would let a
 * prober distinguish "exists but unpublished" from "does not exist" — the same
 * non-enumeration rule the download handler follows. For unreleased client work
 * that matters more than it does for a catalog SKU.
 */
export function ProjectNotFound() {
  const t = useTranslations("Projects");
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

        {/* Never dead-end (EXPERIENCE.md § State Patterns). Both routes exist. */}
        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link href="/projects" className={buttonClasses("primary")}>
            {t("notFoundBackToProjects")}
          </Link>
          {/* The phone affordance renders the NUMBER, with the label as its
              accessible name — the shipped convention on five surfaces. The canvas
              wanted a verb ("Talk to an engineer"); adopting it here would mint a
              second convention, and Story 3.6 explicitly reserves that decision. */}
          <a
            href={`tel:${SITE.phone}`}
            aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
            className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap font-data text-[15px] text-ink hover:text-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            <Phone size={16} aria-hidden />
            {SITE.phoneDisplay}
          </a>
        </div>
      </div>
    </section>
  );
}
