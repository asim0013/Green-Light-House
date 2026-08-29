import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Kicker } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";
import { SlaStepper } from "@/components/sla/SlaStepper";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The `/rfq` 360px side rail (Story 3.2, AC1): the dark SLA card, the
 * "Prefer to talk?" card, and the borderless "WHY NO PRICES?" card.
 *
 * - THE SLA CARD NOW RENDERS THE THREE-STEP PROCESS the canvas draws, from the
 *   content model (Story 3.5). Until then it borrowed the `Industry.sla`
 *   one-liner because the model did not exist; that key is deleted and the
 *   stepper is shared with `RfqConfirmation`, which is what makes an admin edit
 *   reach both surfaces at once. `tone="onDark"` because this card is `bg-ink`:
 *   it drives the kicker (`accent-soft`, 4.68:1 here) and the fallback marker,
 *   neither of which has a tone that passes on both grounds.
 * - The talk card follows the shipped `tel:` anatomy (ProjectCta): the button's
 *   visible label is the canvas's "Call an engineer", its accessible name
 *   contains that label plus the number (2.5.3), and the NUMBER renders in the
 *   data mono beneath — phone numbers are machine data (DESIGN.md § typography).
 * - The cert marks are locale-invariant and deliberately NOT in messages
 *   (they are marks, not copy) — bare mono text, no chips, per the canvas.
 */
export function RfqRail({ sla }: { sla: SlaContent | null }) {
  const t = useTranslations("Rfq");

  return (
    <div className="flex flex-col gap-5">
      {/* The whole card is conditional: an unseeded model must leave no empty
          ink block floating above the talk card. */}
      {sla && (
        <div className="bg-ink p-5">
          <SlaStepper sla={sla} tone="onDark" showKicker />
        </div>
      )}

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

      <div className="px-1">
        <Kicker tone="ink">{t("whyKicker")}</Kicker>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{t("whyBody")}</p>
        <p
          className="mt-4 font-mono text-[12px] uppercase tracking-[0.12em] text-ink-2"
          translate="no"
        >
          ISO 9001 · CE · EN · A.TR
        </p>
      </div>
    </div>
  );
}
