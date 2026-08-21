import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";

/**
 * FR16's defined empty state (Story 2.2): "range expanding — request what you
 * need", linking to the RFQ. Serves three cases with one honest copy set: an
 * empty known category, an unknown `?category` value, and (via `variant`) a
 * fully-empty catalog. Never a blank or broken grid.
 *
 * `/rfq` is the sanctioned phased-page exception — the Epic 2 preamble in the
 * epics file explicitly targets the Epic 3 RFQ route from these surfaces, and
 * EXPERIENCE.md § Surface closure requires every path to terminate at the RFQ or
 * the phone. The co-equal phone action rides along (FR31: everywhere the RFQ CTA
 * appears). The mock's "search by model" affordance is Story 2.5's — not faked.
 */
export function CatalogEmptyState({ variant = "category" }: { variant?: "category" | "catalog" }) {
  const t = useTranslations("Catalog");
  const tNav = useTranslations("Nav");

  return (
    <div className="max-w-[62ch] py-4">
      <h2 className="font-heading text-xl font-bold tracking-tight text-ink">{t("emptyTitle")}</h2>
      <p className="mt-3 leading-relaxed text-ink-2">
        {variant === "catalog" ? t("emptyCatalogLead") : t("emptyLead")}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-4">
        <Link href={SITE.rfqHref} className={buttonClasses("primary")}>
          {t("emptyCta")}
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
  );
}
