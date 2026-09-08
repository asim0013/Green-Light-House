import { useTranslations, useFormatter } from "next-intl";
import type { ProjectBomLineItem } from "@/server/repositories/project";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";

/**
 * The scope-of-supply table (Story 3.1b — AC2). THE SITE'S FIRST TABLE.
 *
 * ⚠️ THERE IS NO PRECEDENT AND NO GATE. Measured before writing this: zero
 * `<table>` elements and zero `overflow-x-auto` declarations existed anywhere in
 * `src/`, and `eslint-config-next` enables six `jsx-a11y` rules, none of which
 * covers tables. Nothing here can be caught by tooling, so every choice below is
 * deliberate and the reasons are written down. `epics:712` says Epic 4's Admin
 * Inquiries table INHERITS this component — so a defect here propagates.
 *
 * ⛔ THE HEADER TOKEN IS `ink-2`, NOT DESIGN.md's `muted`, AND THAT IS A
 * DELIBERATE DEPARTURE FROM THE SPEC. DESIGN.md:177 prescribes "Header row
 * `surface-2` + bottom hairline, mono `muted` headers", and DESIGN.md:44 puts
 * table headers at 10-11px — small text, so the large-text exemption does not
 * apply. `muted` (#8A93A0) measures **2.89:1 on `surface-2`**, an AA failure;
 * `ink-2` (#5A6470) measures 5.60:1. The ratios are already in this repo at
 * `Kicker.tsx:14-27`, and Story 3.1 made exactly this correction on exactly this
 * page (`ProjectMediaBand.tsx`, `IndustrySection.tsx:44`). Implementing the spec
 * literally would have shipped a contrast failure into the canonical component.
 *
 * ⛔ NEVER PUT A FLEX OR GRID UTILITY ON A TABLE ELEMENT. `justify-between` on a
 * `<tfoot>`, `<tr>` or cell strips the `row`/`cell` roles from the accessibility
 * tree in Chromium and Gecko — the footer stops being part of the table for a
 * screen reader, losing the "header + footer summarize" contract EXPERIENCE.md:75
 * states for BOM tables. The footer below is a real `<tr>`; the visual split is
 * done with `colSpan` and text alignment, not flex.
 *
 * ⚠️ THE SCROLLER IS A NAMED REGION, not a bare div. `tabIndex={0}` with an
 * `aria-label` on a plain `<div>` yields `role=generic`, and name-from-author is
 * NOT exposed on generic roles — the name would be silently dropped. `role="region"`
 * is what makes it reachable, and it reuses the `<caption>`'s id so the region
 * name and the visible-to-AT caption are one string rather than two that drift.
 * The scroller is keyboard-focusable because a horizontally scrolling region a
 * mouse user can drag must also be reachable by keyboard (WCAG 2.1.1).
 */
export function ProjectBomTable({
  lines,
  captionId = "bom-caption",
}: {
  lines: readonly ProjectBomLineItem[];
  captionId?: string;
}) {
  const t = useTranslations("Projects");
  const format = useFormatter();

  const unitsTotal = lines.reduce((sum, line) => sum + line.quantity, 0);

  return (
    <div
      role="region"
      aria-labelledby={captionId}
      tabIndex={0}
      className="mt-6 overflow-x-auto border border-border-subtle focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
    >
      {/* ⚠️ `min-w` IS LOAD-BEARING AND THE FIGURE WAS DERIVED, NOT GUESSED. The
          canvas fixes MODEL 220 + MANUFACTURER 200 + QTY 90 = 510, and every row
          carries 40px of horizontal padding. A 560px floor would leave the
          CATEGORY column 10px — and CATEGORY is the column that has to render
          "Clean-agent suppression skid". The fixed pixel widths are dropped so
          MODEL and MANUFACTURER size to content, under a floor that leaves
          CATEGORY real room. Below this the scroller engages; above it the table
          fills its container. */}
      <table className="w-full min-w-[720px] border-collapse text-left">
        <caption id={captionId} className="sr-only">
          {t("bomCaption")}
        </caption>
        <thead>
          <tr className="bg-surface-2">
            {/* `scope="col"` on every header: without it a screen reader cannot
                associate a cell with its column, which is the whole reason this
                is a table rather than a grid of divs. */}
            <th
              scope="col"
              className="border-b border-border-subtle px-5 py-3 font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-2"
            >
              {t("bomCategory")}
            </th>
            <th
              scope="col"
              className="border-b border-border-subtle px-5 py-3 font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-2"
            >
              {t("bomModel")}
            </th>
            <th
              scope="col"
              className="border-b border-border-subtle px-5 py-3 font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-2"
            >
              {t("bomManufacturer")}
            </th>
            <th
              scope="col"
              className="border-b border-border-subtle px-5 py-3 text-right font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-2"
            >
              {t("bomQty")}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id} className="bg-surface">
              <th
                scope="row"
                className="border-b border-border-subtle px-5 py-3.5 text-[14px] font-semibold text-ink"
              >
                {/* The line label is authored editorial text and is translated,
                    so it falls back per field exactly like the body copy does —
                    `lang` marks it for a screen reader and the notice marks it
                    for a sighted reader. */}
                <span lang={line.labelIsFallback ? "en" : undefined}>{line.label}</span>
                {line.labelIsFallback && <FallbackNotice isFallback />}
              </th>
              {/* ⚠️ NOT A LINK, AND NOT `accent`. The canvas colours this cell
                  `$accent` — the site's single action colour — which reads as a
                  link. Making it one would half-link the column (the non-catalog
                  line has no product to point at), raise the 44px-target question
                  inside a scrolling region, and duplicate the links the equipment
                  cards above already provide. Using the action colour for
                  non-interactive text teaches the wrong affordance, so the cell
                  renders in the data font at `ink`. Deliberate departure. */}
              <td className="border-b border-border-subtle px-5 py-3.5 font-data text-[13px] text-ink">
                {line.model}
              </td>
              <td className="border-b border-border-subtle px-5 py-3.5 text-[13px] text-ink-2">
                {/* An em-dash whenever no PUBLISHED product backs the line —
                    which covers both the designed non-catalog row and a product
                    that has been unpublished. Never leaks an unpublished
                    product's identity. */}
                {line.manufacturer ?? "—"}
              </td>
              <td className="border-b border-border-subtle px-5 py-3.5 text-right font-data text-[14px] text-ink">
                {format.number(line.quantity)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-surface-2">
            {/* ⚠️ BOTH FOOTER VALUES ARE DERIVED, NEVER AUTHORED. The canvas's own
                numbers are internally consistent (142+88+60+24+3 = 317 across 5
                lines), which is the tell that they are computed. An authored
                footer would silently disagree with the table the first time a
                line is added, removed or re-quantified. */}
            <th
              scope="row"
              colSpan={3}
              className="px-5 py-3 font-mono text-[11px] font-normal uppercase tracking-[0.12em] text-ink-2"
            >
              {t("bomLineItems", { count: lines.length })}
            </th>
            <td className="px-5 py-3 text-right font-data text-[14px] font-semibold text-ink">
              {t("bomUnitsTotal", { count: unitsTotal })}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
