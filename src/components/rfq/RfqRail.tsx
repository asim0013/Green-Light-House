import { useTranslations } from "next-intl";
import { Kicker } from "@/components/ui";
import { SlaStepper } from "@/components/sla/SlaStepper";
import { TalkCard } from "./TalkCard";
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
          ink block floating above the talk card.
          ⚠️ AND THE CONDITION IS `steps.length`, NOT JUST `sla`. The model
          resolves summary-only by design — `toSlaContent` drops a step whose
          text is missing in both the requested locale and EN, and `sla.test.ts`
          asserts a process with zero steps still resolves so the six SUMMARY
          surfaces keep their sentence. On a STEPPER surface that same row paints
          a dark card containing a kicker and nothing else. */}
      {sla && sla.steps.length > 0 && (
        <div className="bg-ink p-5">
          <SlaStepper sla={sla} tone="onDark" showKicker />
        </div>
      )}

      {/* Story 3.8: the SAME component /contact mounts. Extracted verbatim —
          see `TalkCard` for the three deviations it carries, all owned by 3.6. */}
      <TalkCard />

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
