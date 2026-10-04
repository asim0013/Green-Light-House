import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { rfqProductHref, rfqProjectHref } from "@/lib/rfq-href";
import type { SitePhone } from "@/config/site";

/**
 * The sticky mobile conversion bar (Story 5.5 — UX-DR27; EXPERIENCE.md § Responsive:
 * "quote/facts cards move below the primary content but keep a sticky bottom CTA bar
 * (Request quote / Call) so conversion stays one tap away").
 *
 * ⚠️ MOBILE ONLY (`lg:hidden`). At `lg+` the desktop `ProductAnchorCard` /
 * `ProjectCta` already carry these CTAs, and showing both would double the
 * conversion controls (and the visible `tel:` count). This mirrors the anchor
 * card's actions — a navy primary to the RFQ doorway and a co-equal `tel:` — it
 * does not invent new ones.
 *
 * ⚠️ PAGE-SPECIFIC, NOT CHROME. It takes a `doorway` + `slug` and BUILDS its own
 * RFQ href here — deliberately, so the rfq-CTA and the `tel:` are co-located in
 * THIS file, the way `ProductAnchorCard`/`ProjectCta` co-locate theirs. If the
 * page built the href and passed it, the page file would trip the FR31
 * same-file phone-presence invariant (`rfq-phone-invariant.test.ts`), which keys
 * on the doorway helpers. Mounted per detail page, never in a layout.
 *
 * ⚠️ `sticky bottom-0`, NOT `fixed` — and that is what EXPERIENCE.md asks for ("a
 * sticky bottom CTA bar"). Mounted as the LAST child of the page content, it pins
 * to the viewport bottom while the buyer scrolls through the page, then scrolls
 * up out of the way as the footer comes into view — so it never permanently
 * occludes the footer, with no page-side padding hack. `fixed` would sit over the
 * footer forever.
 *
 * `pb-[env(safe-area-inset-bottom)]`: clear the iOS home indicator so the Call
 * button is not under the gesture bar. Focus: the 5.4 `outline-hidden` + ring
 * convention, never `outline-none`.
 *
 * ⚠️ `bottom-[var(--glh-consent-h,0px)]` (review 5.2 #5): the Story 5.2 consent bar
 * is `fixed bottom-0 z-50` and would otherwise cover this bar on a phone, blocking
 * the Quote/Call buttons for a visitor who has not yet chosen. The consent bar
 * publishes its height to that CSS var while open; this bar lifts by that amount so
 * both stack and stay tappable. The var is `0px` when the bar is closed (flush).
 */
export function MobileCtaBar({
  doorway,
  slug,
  phone,
}: {
  doorway: "product" | "project";
  slug: string;
  phone: SitePhone;
}) {
  const t = useTranslations("Nav");
  const rfqHref = doorway === "product" ? rfqProductHref(slug) : rfqProjectHref(slug);

  return (
    <nav
      aria-label={t("quickActions")}
      className="sticky bottom-[var(--glh-consent-h,0px)] z-40 border-t border-border-subtle bg-surface pb-[env(safe-area-inset-bottom)] transition-[bottom] duration-150 lg:hidden"
    >
      <div className="flex items-stretch gap-3 px-4 py-3">
        <Link href={rfqHref} className={`${buttonClasses("primary")} min-h-11 flex-1`}>
          {t("requestQuote")}
        </Link>
        <a
          href={`tel:${phone.phone}`}
          // WCAG 2.5.3 (label in name): the accessible name STARTS WITH the
          // visible label (`callShort`) so voice control works in every locale —
          // `phoneLabel` ("Bizi arayın"/"Позвонить нам") does NOT contain the
          // visible "Ara"/"Позвонить". The display number follows for context.
          aria-label={`${t("callShort")}: ${phone.phoneDisplay}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 border-[1.5px] border-ink bg-surface px-5 font-body text-[15px] font-semibold text-ink hover:bg-surface-2 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          <Phone size={16} aria-hidden />
          {t("callShort")}
        </a>
      </div>
    </nav>
  );
}
