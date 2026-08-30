import { Kicker } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The three-step response process (Story 3.5 — UX-DR14, FR30/FR34a).
 *
 * Mounted on exactly TWO surfaces — the `/rfq` side rail and the submitted
 * confirmation — which is what `epics:876` requires ("both mount the same
 * component"). The other six SLA surfaces draw the one-line sentence instead;
 * that is `SlaSummary`.
 *
 * ⚠️ PRESENTATIONAL AND PROP-DRIVEN, AND THAT IS FORCED. `RfqConfirmation` is a
 * `"use client"` component mounted from inside `RfqForm`, which is also a client
 * component — a component reachable from a client parent CANNOT be async. So
 * this never fetches; `rfq/page.tsx` does one read and threads it through both.
 *
 * ⚠️ `tone` IS LOAD-BEARING, NOT STYLING. The rail is `bg-ink` and the
 * confirmation is `bg-surface` (white), and neither `Kicker` nor `FallbackNotice`
 * has a tone that passes AA on both: `Kicker`'s default `accent` measures 4.68:1
 * on ink but 3.79:1 on white, and `FallbackNotice`'s default light token measures
 * 2.96:1 on ink. One component on two grounds means the tone must travel with it.
 *
 * ⚠️ THE THIRD BADGE IS AN ARROW AND PROMISES NO DURATION. The formal quote is
 * deliberately unpromised — GLH commits to the sequence, not to a date. Nothing
 * here may invent a number for it; the value comes from the content model, and
 * `SlaStepper.test.tsx` pins it.
 *
 * THE BADGE FRAME HUGS. The canvas draws a fixed 46x34 box, which fits "24h" but
 * clips the translated forms — TR seeds "24 saat" and RU "24 ч". `min-w-[46px]`
 * plus padding keeps the canvas's proportions for EN and grows for the rest.
 */
export function SlaStepper({
  sla,
  tone,
  showKicker = false,
}: {
  sla: SlaContent;
  /** Must match the surface: `onDark` for the ink rail, `light` for the white
   *  confirmation. Drives BOTH the kicker and the fallback marker. */
  tone: "light" | "onDark";
  /** The rail draws the model's kicker above the steps; the confirmation does
   *  not, and did not before this story either. ⚠️ The kicker is NOT quoted here:
   *  it is content, and the AC5 gate sweeps this file for exactly that. */
  showKicker?: boolean;
}) {
  const onDark = tone === "onDark";
  const badgeClasses = onDark ? "border-accent-soft text-accent-soft" : "border-muted text-ink-2";
  const titleClasses = onDark ? "text-white" : "text-ink";
  const descriptionClasses = onDark ? "text-on-dark-text" : "text-ink-2";

  return (
    <div className="flex flex-col gap-[18px]">
      {showKicker && (
        <span>
          <Kicker tone={onDark ? "accent" : "ink"}>
            {sla.isFallback ? <span lang="en">{sla.kicker}</span> : sla.kicker}
          </Kicker>
          <FallbackNotice isFallback={sla.isFallback} tone={tone} />
        </span>
      )}

      <ol className="flex flex-col gap-[14px]">
        {sla.steps.map((step, index) => (
          <li key={index} className="flex items-start gap-[14px]">
            <span
              // `translate="no"`: the badge is a measurement token, and the
              // arrow on step three is a glyph — neither is prose for a machine
              // translator to rewrite.
              translate="no"
              className={`inline-flex min-h-[34px] min-w-[46px] shrink-0 items-center justify-center border px-2 font-data text-[14px] ${badgeClasses}`}
            >
              {step.badge}
            </span>
            <span className="flex flex-col gap-[3px]">
              <span className={`text-[14px] font-semibold ${titleClasses}`}>
                {sla.isFallback ? <span lang="en">{step.title}</span> : step.title}
              </span>
              <span className={`text-[13px] leading-[1.45] ${descriptionClasses}`}>
                {sla.isFallback ? <span lang="en">{step.description}</span> : step.description}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
