import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Kicker } from "@/components/ui";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { SITE } from "@/config/site";

/**
 * The `/rfq` 360px side rail (Story 3.2, AC1): the dark SLA card, the
 * "Prefer to talk?" card, and the borderless "WHY NO PRICES?" card.
 *
 * - THE SLA CARD RENDERS THE ONE-LINER, NOT THE THREE-STEP PROCESS. The canvas
 *   draws a 3-step stepper here ("24h → Technical review → …") but that content
 *   is Story 3.5's (the sprint resequencing put 3.2 five stories before it) —
 *   this card reads the EXISTING `Industry.sla` key, exactly like `ProjectCta`,
 *   and 3.5 swaps the source when the content model lands. Kicker default tone
 *   (`accent-soft`) is the DARK-band tone; the body is `on-dark-text` — the
 *   mock's untokenized #9AA6B4 hex swapped for the token (tokenization, not a
 *   contrast fix: the hex itself measured 7.19:1).
 * - The talk card follows the shipped `tel:` anatomy (ProjectCta): the button's
 *   visible label is the canvas's "Call an engineer", its accessible name
 *   contains that label plus the number (2.5.3), and the NUMBER renders in the
 *   data mono beneath — phone numbers are machine data (DESIGN.md § typography).
 * - The cert marks are locale-invariant and deliberately NOT in messages
 *   (they are marks, not copy) — bare mono text, no chips, per the canvas.
 */
export function RfqRail() {
  const t = useTranslations("Rfq");
  const tIndustry = useTranslations("Industry");

  return (
    <div className="flex flex-col gap-5">
      <div className="bg-ink p-5">
        <Kicker>{t("slaKicker")}</Kicker>
        <p className="mt-3 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-on-dark-text">
          {tIndustry("sla")}
        </p>
      </div>

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
