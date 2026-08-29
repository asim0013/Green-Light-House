import { cache } from "react";
import type { Locale } from "@prisma/client";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { resolveTranslation } from "@/server/i18n/resolveTranslation";

/**
 * The site-wide response process (Story 3.5 — FR30/FR34a/FR38).
 *
 * ⚠️ THE ONLY SOURCE OF SLA COPY. Until this story the same sentence was
 * byte-copied into four `messages/` namespaces plus a fifth key for the kicker —
 * fifteen strings across three locales, all deleted. Eight render sites read
 * this instead, so one edit plus one `revalidateTag` changes every one of them
 * with no rebuild (FR30's deploy-free half).
 *
 * ⚠️ A SINGLETON, WHICH IS NEW HERE. Every other read in this directory is a
 * collection or a slug-keyed entity; this one addresses ONE row by a stable key
 * so the read is deterministic and Story 4.8's editor has something to target.
 *
 * TWO REPRESENTATIONS, ONE SOURCE. `summary` backs the six surfaces that draw a
 * one-line trust sentence; `steps` backs the two that draw the stepper. The
 * summary is stored rather than composed because it is NOT derivable from the
 * step data — the EN steps say "Spec + proposal" where the sentence says
 * "specced proposal", and the TR sentence inverts the order with an agglutinative
 * locative. Composing it would mean authoring a per-locale join template in
 * `messages/`, which is precisely what this story removes.
 */

/** The singleton's key. The seed writes this exact value; if the two ever
 *  diverge the read returns null and every SLA surface silently empties, which
 *  is why `repository.integration.test.ts` asserts the seeded row is findable. */
export const SLA_PROCESS_KEY = "default";

export interface SlaStepItem {
  /** "24h" / "24 saat" / "24 ч" — or the arrow on step three. Translated. */
  badge: string;
  title: string;
  description: string;
}

export interface SlaContent {
  kicker: string;
  /** The one-line sentence the six non-stepper surfaces render. */
  summary: string;
  /** Exactly three, in `sort` order. */
  steps: SlaStepItem[];
  /** True when the process text fell back to EN (FR34a). */
  isFallback: boolean;
}

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
    steps.push({ badge: s.value.badge, title: s.value.title, description: s.value.description });
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
