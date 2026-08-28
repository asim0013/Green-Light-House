"use client";

import { useTranslations } from "next-intl";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { RfqPrefill } from "@/server/rfq-prefill";
import { labelOf } from "./EquipmentChips";

/**
 * The pre-fill banner and its Clear control (Story 3.4, AC7/AC8).
 *
 * ⚠️ COMPOSED NODES, NOT ONE INTERPOLATED STRING — and this is forced, not
 * stylistic. UX-DR21 requires a VISIBLE "shown in English" marker on each
 * independently-fallible name, and an ICU message cannot attach a marker to one
 * of its own interpolations: `t("banner", { equipment, industry })` can only
 * produce text. So the sentence is assembled here from a localized LEAD-IN plus
 * server-resolved names, each rendered with its own `FallbackNotice`.
 *
 * ⚠️ SEPARATOR IS U+00B7 (·), the house separator — both the canvas
 * (`outline:632`) and the epics AC agree. An earlier brief for this story wrote
 * it as a hyphen; it is pinned in an e2e assertion, so it is spelled from a
 * named constant rather than typed inline at each site.
 *
 * NO LABEL FROM THE URL REACHES THIS COMPONENT. Every name here was resolved
 * server-side from a slug through the repositories — which is what makes it
 * localizable and fallback-markable, and what stops a crafted URL putting
 * attacker-chosen text on the page. `query` is the deliberate exception and is
 * not a catalog label: it is the buyer's own search text, already echoed to them
 * on the zero-result page they arrived from, and re-gated at the route.
 */

/** U+00B7. Spelled by code point so no literal multi-byte character hides in the
 *  source. Pinned by the `?project=` doorway assertion in `e2e/rfq.spec.ts` —
 *  which was NOT true when this comment first claimed it, and is now (3.4
 *  review). Swapping it for a hyphen reddens there. */
const SEPARATOR = ` ${String.fromCharCode(0x00b7)} `;

/**
 * One server-resolved catalog name, with its fallback marking.
 *
 * ⚠️ `lang="en"` GOES ON THE CONTENT, not just beside it (3.4 review).
 * `FallbackNotice`'s own docstring writes the caller's half of the contract
 * down: "The fallen-back *content* is marked `lang='en'` by the caller so screen
 * readers announce the language switch (AC4) — this component only renders the
 * honest 'fallback happened' hint next to it." The banner shipped honouring the
 * visible half and skipping the announced one, so a Turkish buyer's screen
 * reader pronounced an English product name with Turkish phonemes — the WCAG
 * 3.1.2 failure the convention exists to prevent, on the one surface whose whole
 * job is composing names from three locales.
 */
function ResolvedName({
  children,
  isFallback,
}: {
  children: React.ReactNode;
  isFallback: boolean;
}) {
  return (
    <>
      {isFallback ? <span lang="en">{children}</span> : children}
      <FallbackNotice isFallback={isFallback} />
    </>
  );
}

const LEAD_IN = {
  project: "prefillProject",
  product: "prefillProduct",
  industry: "prefillIndustry",
  category: "prefillCategory",
  search: "prefillSearch",
} as const;

export function PrefillBanner({
  prefill,
  onClear,
  clearRef,
}: {
  prefill: RfqPrefill;
  onClear: () => void;
  /** Parent-owned so the form can decide where focus lands after Clear. */
  clearRef?: React.RefObject<HTMLButtonElement | null>;
}) {
  const t = useTranslations("Rfq");

  const parts: React.ReactNode[] = [];
  prefill.equipment.forEach((item, index) => {
    parts.push(
      <span key={`chip-${index}`}>
        <ResolvedName isFallback={prefill.equipmentFallback[index] ?? false}>
          {labelOf(item)}
        </ResolvedName>
      </span>,
    );
  });
  if (prefill.industry) {
    parts.push(
      <span key="industry">
        <ResolvedName isFallback={prefill.industry.isFallback}>
          {prefill.industry.name}
        </ResolvedName>
      </span>,
    );
  }
  if (prefill.query) {
    // Buyer text, not a catalog name — no fallback marker applies to it.
    parts.push(<span key="query">{prefill.query}</span>);
  }

  // AC2: "no empty banner, no placeholder text". A doorway that resolved nothing
  // renders nothing at all rather than a shell.
  //
  // `doorway` is null for exactly that case since the 3.4 review — the params
  // still travel for attribution, but there is no lead-in to name and nothing
  // to show. Both halves are checked because they can fail independently: a
  // doorway can resolve (`doorway` set) while every part is empty, and the
  // params can survive with no doorway at all.
  const doorway = prefill.doorway;
  if (!doorway || parts.length === 0) return null;

  return (
    <div
      // `border-ink-2`, NOT `border-muted`. On this page's `surface-2` ground
      // `border-muted` measures 2.89:1 and FAILS WCAG 1.4.11 — the exact cliff
      // that forced the same swap on the attachment control in the 3.7b review.
      className="flex flex-wrap items-center gap-x-2 gap-y-1 border border-ink-2 bg-surface px-4 py-3 text-[15px] text-ink"
      data-testid="rfq-prefill-banner"
    >
      <span className="text-ink-2">{t(LEAD_IN[doorway])}</span>
      <span className="font-medium">
        {parts.map((part, index) => (
          <span key={index}>
            {index > 0 && <span aria-hidden>{SEPARATOR}</span>}
            {part}
          </span>
        ))}
      </span>
      <button
        type="button"
        ref={clearRef}
        onClick={onClear}
        aria-label={t("prefillClearLabel")}
        // The ring is HAND-WRITTEN rather than borrowed from `buttonClasses`,
        // which still carries `focus-visible:outline-none` — one of the 13
        // recorded offenders that breaks Windows forced-colors mode. Fixing that
        // token would change focus behaviour on every button on the site, a
        // blast radius Story 3.2 declined and 3.4 declines too.
        //
        // `min-h-11 min-w-11` UNQUALIFIED: the `max-sm:` chip idiom silently
        // fails the >=44px floor on desktop, and padding-derived height is
        // font-metric dependent rather than measured.
        className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-[13px] font-semibold text-accent underline-offset-4 hover:underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("prefillClear")}
      </button>
    </div>
  );
}
