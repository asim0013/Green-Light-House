import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SITE } from "@/config/site";
import { CONTAINER } from "./container";
import { Kicker } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";

/**
 * The 404 body (Story 1.9), shared by both routes that can render one:
 * `app/global-not-found.tsx` (unmatched URLs — the common case) and
 * `[locale]/not-found.tsx` (an explicit `notFound()` call, which Epic 2 will make
 * for unknown slugs). Sharing it means the two can never drift.
 *
 * NEITHER SPINE DEFINES A 404 STATE (verified: zero matches for `404` / `not found`
 * / `error page` across EXPERIENCE.md and DESIGN.md), so this is built from the
 * rules that DO bind it rather than from a new visual language:
 *  - DESIGN.md anti-patterns rule out the two commonest 404 treatments outright —
 *    no illustration hero, no decorative dividers. Also no boxing in cards, no
 *    shadows, radius 0.
 *  - One primary action per view; navy `accent` is the only action colour.
 *  - EXPERIENCE.md: a "nothing here" state is explanation + a way onward, never a
 *    dead end, and phone is a first-class action.
 *  - Voice: "advantage, never an apology" — this does not say sorry.
 *  - `muted` fails AA for body text, so the lead uses `text-ink-2` (6.01:1).
 *
 * RECOVERY LINKS ARE DELIBERATELY LIMITED TO WHAT EXISTS. When this froze
 * (Story 1.6) the nav destinations and `SITE.rfqHref` all 404ed; the freeze
 * named Story 3.2 as its expiry and 3.2 HAS NOW LANDED `/rfq` (with the nav
 * routes built across Epic 2/3.1). The links here are still Home + phone —
 * widening them (an RFQ action on the 404 is the obvious candidate) is a
 * recorded follow-up in deferred-work.md, not a silent scope-grab by 3.2.
 */
export function NotFoundContent() {
  const t = useTranslations("NotFound");
  const tNav = useTranslations("Nav");

  return (
    <div className={`${CONTAINER} flex flex-1 flex-col justify-center py-20 md:py-28`}>
      <div className="max-w-[52ch]">
        <Kicker tone="ink">{t("kicker")}</Kicker>

        <h1 className="mt-4 font-heading text-[34px] font-bold leading-tight tracking-tight text-ink md:text-[40px]">
          {t("title")}
        </h1>

        <p className="mt-5 text-[17px] leading-relaxed text-ink-2">{t("description")}</p>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <Link href="/" className={buttonClasses("primary")}>
            {t("backHome")}
          </Link>
          {/* Co-equal phone, matching the hero's treatment: a first-class tel:
              action. The visible number stays inside the accessible name (WCAG 2.5.3). */}
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
    </div>
  );
}
