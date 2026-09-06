import { cache } from "react";
import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

/**
 * The site-wide response process (Story 3.5 — FR30/FR34a/FR38).
 *
 * ⚠️ THE ONLY SOURCE OF THE SLA's NUMBERS AND STEPS. Until this story the same
 * sentence was byte-copied into four `messages/` namespaces plus a fifth key for
 * the kicker — fifteen strings across three locales, all deleted. Eight render
 * sites read this instead, so one edit plus one `revalidateTag` changes every
 * one of them with no rebuild (FR30's deploy-free half).
 *
 * ⚠️ IT IS NOT THE ONLY PLACE THE OFFER IS DESCRIBED, and an earlier revision of
 * this docstring overstated that. `Rfq.lead` and `Privacy.use` still name the
 * two DELIVERABLES in prose ("a technical review and a specced proposal"). That
 * is deliberate and safe: they carry no durations and no step structure, so an
 * admin editing the model cannot leave them contradicting it. What FR30 requires
 * to be editable without a deploy is the COMMITMENT — the numbers, the sequence,
 * the badges — and that lives here and nowhere else. The AC5 gate enforces that
 * boundary, not a ban on ever mentioning the service.
 *
 * ⚠️ A SINGLETON, WHICH IS NEW HERE. Every other read in this directory is a
 * collection or a slug-keyed entity; this one addresses ONE row by a stable key
 * so the read is deterministic and Story 4.8's editor has something to target.
 *
 * TWO REPRESENTATIONS, ONE SOURCE. `summary` backs the seven surfaces that draw a
 * one-line trust sentence; `steps` backs the two that draw the stepper. The
 * summary is stored rather than composed because it is NOT derivable from the
 * step data — the EN steps say "Spec + proposal" where the sentence says
 * "specced proposal", and the TR sentence inverts the order with an agglutinative
 * locative. Composing it would mean authoring a per-locale join template in
 * `messages/`, which is precisely what this story removes.
 */

/**
 * The singleton's key, re-exported from the module the SEED also reads it from.
 *
 * ⚠️ NOT REDECLARED HERE. It used to be, with the seed hard-coding the same
 * literal separately — two sources for the one string that joins them. If they
 * diverged the read would return null and every SLA surface would silently
 * empty, which is why `repository.integration.test.ts` asserts the seeded row is
 * findable. Now they cannot diverge.
 */
export { SLA_PROCESS_KEY } from "../../../scripts/sla-fixtures";
import { SLA_PROCESS_KEY } from "../../../scripts/sla-fixtures";

export interface SlaStepItem {
  /** "24h" / "24 saat" / "24 ч" — or the arrow on step three. Translated. */
  badge: string;
  title: string;
  description: string;
  /**
   * True when THIS STEP's row fell back to EN (FR34a).
   *
   * ⚠️ PER-STEP, NOT PER-PROCESS, AND THE DISTINCTION IS THE WHOLE POINT. Steps
   * resolve independently of the process text and of each other — `sla.test.ts`
   * asserts exactly that — so the mixed state is reachable by design: a Turkish
   * process row whose step 2 has no TR translation, or an EN-fallback process
   * whose steps DO have Turkish rows. Marking step copy with the process-level
   * flag is wrong in both directions: it leaves an English step unmarked on a
   * Turkish page, and it stamps `lang="en"` on genuinely Turkish text. That is
   * the same defect the 3.4 review found in `PrefillBanner`.
   */
  isFallback: boolean;
}

export interface SlaContent {
  kicker: string;
  /** The one-line sentence the seven non-stepper surfaces render. */
  summary: string;
  /**
   * The steps, in `sort` order.
   *
   * ⚠️ THREE BY CONVENTION, NOT BY CONSTRAINT — an earlier revision of this
   * comment said "exactly three" and nothing enforced it. The seed writes three;
   * the schema permits any number; the mapper DROPS a step whose text is missing
   * in both the requested locale and EN, so even a three-row model can resolve
   * to two or zero. Callers that draw a stepper must handle the empty case
   * (`RfqRail` and `RfqConfirmation` guard on `steps.length`).
   */
  steps: SlaStepItem[];
  /**
   * True when the PROCESS text (kicker + summary) fell back to EN (FR34a).
   *
   * ⚠️ This says NOTHING about the steps. Each step carries its own
   * `isFallback` because each resolves independently — read that one when
   * marking step copy, never this one.
   */
  isFallback: boolean;
}

/**
 * ⚠️ `hasSlaSummary` DELIBERATELY DOES NOT LIVE HERE — it is in
 * `src/lib/sla-content.ts`. It was defined in this file first, and importing it
 * from the six summary components turned their type-only import of this module
 * into a VALUE import, dragging `@/lib/db`'s `PrismaClient` and `next/cache`
 * into component bundles: every public page answered 500. Presentational
 * predicates go in the leaf module that imports only the TYPE.
 */

/**
 * The minimum structural shape the mapper consumes — narrower than Prisma's row
 * type so it is unit-testable with plain objects, per `toServiceListItem`.
 */
export interface SlaProcessRow {
  translations: readonly { locale: Locale; kicker: string; summary: string }[];
  steps: readonly {
    sort: number;
    translations: readonly {
      locale: Locale;
      badge: string;
      title: string;
      description: string;
    }[];
  }[];
}

/**
 * Resolve one process row for `locale` (EN fallback, FR34a).
 *
 * Returns `null` for the DEGENERATE case — no row, or a row with neither the
 * requested locale nor EN. ⚠️ That branch is REACHABLE: a fresh clone before
 * `db:seed`, a production `migrate deploy` without a seed, or a Story 4.8 admin
 * deleting a row. It renders NOTHING rather than fabricating a promise: a
 * hard-coded English default would put an unreviewed commitment on eight public
 * surfaces and mask the real gap. Callers must handle null.
 *
 * A step whose own text is missing in BOTH the requested locale and EN is
 * dropped rather than rendered blank — a stepper row with an empty badge and no
 * title is worse than a shorter stepper.
 */
export function toSlaContent(process: SlaProcessRow, locale: Locale): SlaContent | null {
  const t = resolveTranslation(process.translations, locale);
  if (!t) return null;

  const steps: SlaStepItem[] = [];
  for (const step of [...process.steps].sort((a, b) => a.sort - b.sort)) {
    const s = resolveTranslation(step.translations, locale);
    if (!s) continue;
    steps.push({
      badge: s.value.badge,
      title: s.value.title,
      description: s.value.description,
      isFallback: s.isFallback,
    });
  }

  return {
    kicker: t.value.kicker,
    summary: t.value.summary,
    steps,
    isFallback: t.isFallback,
  };
}

/**
 * The cached read. One entry per locale, invalidated by `TAGS.sla`.
 *
 * ⚠️ WRAPPED IN REACT `cache()`, AND THAT IS NOT REDUNDANT WITH `cached()`.
 * `cached()` is `unstable_cache` — a cross-request Redis-backed cache that does
 * NOT dedupe within a single request. `/industries/[slug]` mounts TWO SLA
 * consumers (the hero and the closing band), so without the React-level memo one
 * render performs two round trips for the same value. `getServicesPageData` uses
 * the same pairing for the same reason.
 */
export const getSlaContent = cache(async (locale: Locale): Promise<SlaContent | null> =>
  cached(() => querySlaContent(locale), ["sla-process", locale], [TAGS.sla]),
);

/** Uncached SQL read. Exported for integration tests — see the note in `@/lib/cache`. */
export async function querySlaContent(locale: Locale): Promise<SlaContent | null> {
  const process = await prisma.slaProcess.findUnique({
    where: { key: SLA_PROCESS_KEY },
    select: {
      translations: { select: { locale: true, kicker: true, summary: true } },
      steps: {
        orderBy: { sort: "asc" },
        select: {
          sort: true,
          translations: {
            select: { locale: true, badge: true, title: true, description: true },
          },
        },
      },
    },
  });

  if (!process) return null;
  return toSlaContent(process, locale);
}
