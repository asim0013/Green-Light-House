import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";

/**
 * The "prefer to talk?" card — ONE component, mounted by `/rfq` and `/contact`
 * (Story 3.8 AC8; Story 3.6 owns the phone surface).
 *
 * ⚠️ THIS IS THE SINGLE PLACE THE TALK CARD LIVES, AND THAT IS THE WHOLE POINT.
 * Story 3.8 extracted it from `RfqRail` verbatim and refused to "improve" it, so
 * that Story 3.6's reconciliation would touch ONE component instead of two
 * copies. That extraction discharged here — the three deviations 3.8 recorded
 * and deliberately left for 3.6 are all now closed:
 *
 *  1. THE NUMBER IS THE LARGEST ELEMENT IN THE COLUMN (AC3). It renders in mono
 *     at 22px above the 17px heading — was 13px, the smallest text in the card.
 *  2. THE NUMBER IS ITSELF A `tel:` TARGET (AC3). It was a non-interactive `<p>`;
 *     now both the number and the button dial. Both clear the 44px floor with an
 *     explicit `min-h-11` (AC2), not padding arithmetic.
 *  3. ONE LABEL RULE, applied here too (AC4): accessible name = visible label +
 *     ": " + number, per WCAG 2.5.3 (Label in Name). The two anchors have
 *     DIFFERENT visible labels, so they take different prefixes and that is
 *     correct, not a third convention:
 *       - the NUMBER link's visible label is the number, so it uses the 14-site
 *         majority prefix `Nav.phoneLabel` ("Call us") — this card no longer
 *         diverges from the rest of the site on the bare-number convention;
 *       - the BUTTON's visible label is text ("Call an engineer" = `Rfq.talkCta`,
 *         the spelling the canvas states in two frames), so its accessible name
 *         keeps that prefix. Forcing `Nav.phoneLabel` onto a button that visibly
 *         reads "Call an engineer" would BREAK 2.5.3, which is why one string
 *         across all fifteen sites is wrong. "Talk to an engineer" (the minority
 *         canvas spelling) is retired — it is in no catalogue and minting it
 *         would be the forbidden third convention.
 *
 * ⚠️ IT STAYS IN `rfq/` AND KEEPS THE `Rfq` NAMESPACE for its own copy; the
 * bare-number prefix legitimately reads `Nav` because that is the shared phone
 * label the other fourteen sites already use.
 *
 * ⚠️ THE NUMBER IS STILL `SITE.phone`'s PLACEHOLDER, and that is correct here.
 * The phone is CHROME: the same placeholder already renders in the header on
 * every page, the homepage hero, every industry and project page, `/services`
 * and the 404. It is exempt from /contact's configured-channels rule, because
 * hiding it on one page while fifteen other surfaces show it would be the
 * inconsistency, not the fix. Replacing it is an owner action
 * (`owner-actions.md` §1), not a dev task.
 */
export function TalkCard() {
  const t = useTranslations("Rfq");
  const tNav = useTranslations("Nav");

  return (
    <div className="border border-border-subtle bg-surface p-5">
      <h2 className="font-heading text-[17px] font-bold tracking-tight text-ink">
        {t("talkTitle")}
      </h2>
      <p className="mt-2 text-[13px] text-ink-2">{t("talkHours")}</p>
      {/* The number: the largest element in the column, in mono, and itself a
          `tel:` target. Accessible name follows the 14-site majority convention
          (`Nav.phoneLabel` + number) so 2.5.3 holds and the site keeps ONE label
          rule. `translate="no"` because it is machine data, not prose. */}
      <a
        href={`tel:${SITE.phone}`}
        aria-label={`${tNav("phoneLabel")}: ${SITE.phoneDisplay}`}
        translate="no"
        className="mt-3 flex min-h-11 items-center font-data text-[22px] font-semibold tracking-tight text-ink hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
      >
        {SITE.phoneDisplay}
      </a>
      <a
        href={`tel:${SITE.phone}`}
        aria-label={`${t("talkCta")}: ${SITE.phoneDisplay}`}
        className={buttonClasses("secondary", "mt-3 min-h-11 w-full gap-2")}
      >
        <Phone size={16} aria-hidden />
        {t("talkCta")}
      </a>
    </div>
  );
}
