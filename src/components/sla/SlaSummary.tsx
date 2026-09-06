import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { SlaContent } from "@/server/repositories/sla";

/**
 * The one-line SLA trust sentence (Story 3.5 — FR30/FR34a).
 *
 * ⚠️ RENDERS NO WRAPPER, DELIBERATELY. Seven surfaces draw this sentence and each
 * one owns its own typography — the homepage rules a border above it, the
 * product aside is the only non-uppercase variant, four sit on dark bands. So
 * this returns the TEXT and its fallback marker, and each caller keeps the `<p>`
 * it already had. AC4's "visually unchanged" is literal: the only difference on
 * any of the six is the FR34a marker, and only when the row actually fell back.
 *
 * ⚠️ PRESENTATIONAL AND PROP-DRIVEN. It cannot fetch: all six callers are
 * SYNCHRONOUS server components taking typed props, so the page above them does
 * the read (see `getSlaContent`). Making this async would force six component
 * signatures to change and break their `renderToStaticMarkup` tests.
 *
 * NOT A STEPPER. The three-row presentation is `SlaStepper`, mounted on exactly
 * two surfaces. Same source, two representations — the AC requires every site to
 * CHANGE WITH the content, never to render identically.
 */
export function SlaSummary({
  sla,
  tone,
}: {
  sla: SlaContent;
  /** Must match the surface — drives the fallback marker's contrast. */
  tone: "light" | "onDark";
}) {
  return (
    <>
      {sla.isFallback ? <span lang="en">{sla.summary}</span> : sla.summary}
      <FallbackNotice isFallback={sla.isFallback} tone={tone} />
    </>
  );
}
