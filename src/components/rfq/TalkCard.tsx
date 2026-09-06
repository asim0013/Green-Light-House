import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";

/**
 * The "prefer to talk?" card — ONE component, mounted by `/rfq` and `/contact`
 * (Story 3.8, AC8).
 *
 * ⚠️ EXTRACTED VERBATIM FROM `RfqRail`, WITH NO BEHAVIOURAL AND NO COPY CHANGE.
 * That restraint is the whole point of the extraction. Story 3.6 (co-equal
 * direct phone contact) owns the phone surface and runs AFTER this story; it now
 * has ONE component to change instead of two copies to reconcile. Fixing
 * anything here would pre-empt a decision Story 3.1 deliberately deferred and
 * Story 3.2 was criticised for pre-empting.
 *
 * ⚠️ IT STAYS IN `rfq/` AND KEEPS READING THE `Rfq` NAMESPACE. Moving the file
 * or repointing the keys would BE the copy change AC8 forbids.
 *
 * ⚠️ THREE KNOWN DEVIATIONS TRAVEL WITH IT. They are recorded, deliberately
 * unfixed, and belong to Story 3.6:
 *
 *  1. 3.6 AC3 wants the number "set in mono as the typographically largest
 *     element in its column". It renders at 13px beneath a 17px heading — the
 *     SMALLEST text in the card, not the largest.
 *  2. 3.6 AC3 wants "BOTH the number and the button as `tel:` targets". Only the
 *     button is a link; the number is a non-interactive `<p>`.
 *  3. ⚠️ THE ONE THIS EXTRACTION CREATES. Fifteen `tel:` sites ship today and
 *     FOURTEEN build their accessible name from `Nav.phoneLabel` ("Call us").
 *     This card is the one exception, using `Rfq.talkCta`. Mounting it on a
 *     second page propagates the minority convention — the correct trade under
 *     AC8 (3.8 mints no label and changes no copy, and the epics forbids minting
 *     a third convention), but a real cost. 3.6's reconciliation now covers two
 *     mount sites, and this file is the single place to fix all of them.
 *
 * ⚠️ THE NUMBER IS STILL `SITE.phone`'s PLACEHOLDER, and that is correct here.
 * The phone is CHROME: the same placeholder already renders in the header on
 * every page, the homepage hero, every industry and project page, `/services`
 * and the 404. It is exempt from /contact's configured-channels rule, because
 * hiding it on one page while fifteen other surfaces show it would be the
 * inconsistency, not the fix. Replacing it is an owner action
 * (`owner-actions.md`), not a dev task.
 */
export function TalkCard() {
  const t = useTranslations("Rfq");

  return (
    <div className="border border-border-subtle bg-surface p-5">
      <h2 className="font-heading text-[17px] font-bold tracking-tight text-ink">
        {t("talkTitle")}
      </h2>
      <p className="mt-2 text-[13px] text-ink-2">{t("talkHours")}</p>
      <a
        href={`tel:${SITE.phone}`}
        aria-label={`${t("talkCta")}: ${SITE.phoneDisplay}`}
        className={buttonClasses("secondary", "mt-4 w-full gap-2")}
      >
        <Phone size={16} aria-hidden />
        {t("talkCta")}
      </a>
      <p className="mt-2 text-center font-data text-[13px] text-ink-2" translate="no">
        {SITE.phoneDisplay}
      </p>
    </div>
  );
}
