import { Locale } from "@prisma/client";

/**
 * THE SLA COPY, in one place (Story 3.5 — FR30/FR34a/FR38).
 *
 * Lives here, beside `doc-fixtures` and `media-fixtures`, for the same reason
 * those do: `prisma/seed.ts` writes it into the database, and something else has
 * to be able to READ it without a database. That something is the AC5 hygiene
 * gate, which derives its search needles from these exact strings at run time
 * and then proves no tracked file outside the content model repeats them.
 *
 * ⚠️ A LITERAL COPY OF ANY STRING BELOW, ANYWHERE ELSE IN THE TREE, IS A BUG the
 * gate will fail on. That is the point: this content used to be byte-copied into
 * four `messages/` namespaces plus a kicker key — fifteen strings across three
 * locales — and the 2.6 review found TR and RU had additionally inlined the
 * numbers into `ctaLead` prose, a fourth uncentralised copy the next revision
 * would have missed. One source, eight surfaces, one revalidate.
 *
 * ⚠️ THE TR AND RU STEP COPY IS DRAFTED, NOT APPROVED. The EN column is
 * canvas-verbatim and the kicker/summary rows are the exact strings the shipped
 * `Rfq.slaKicker` / `Home.sla` keys carried, so those need no review. The nine
 * TR/RU step cells were authored for this story and are tracked as an owner
 * action, the way `SITE.phone`'s placeholder is — a buyer reads them, so they
 * need a native eye before launch, not before merge.
 */

export interface SlaProcessText {
  locale: Locale;
  kicker: string;
  summary: string;
}

export interface SlaStepText {
  locale: Locale;
  badge: string;
  title: string;
  description: string;
}

/**
 * U+2192, the third step's badge.
 *
 * A NAMED CONSTANT because it is an invariant, not a string: the seed, the
 * component test and the e2e all depend on step three carrying an arrow and NOT
 * a duration — the formal quote is deliberately unpromised, and the canvas's
 * own note says so in capitals ("do not invent a number"). Spelled from its code
 * point so the data and the assertions cannot drift by an invisible glyph.
 */
export const SLA_ARROW_BADGE = String.fromCharCode(0x2192);

/** The kicker + one-line summary, per locale. Seeded verbatim from the keys this
 *  story deletes, so no customer-facing copy changes. */
export const SLA_PROCESS_TEXT: SlaProcessText[] = [
  {
    locale: Locale.en,
    kicker: "What happens next",
    summary: "Technical review in 24 h · specced proposal in 3 working days",
  },
  {
    locale: Locale.tr,
    kicker: "Sonraki adımlar",
    summary: "24 saatte teknik değerlendirme · 3 iş gününde şartnameli teklif",
  },
  {
    locale: Locale.ru,
    kicker: "Что дальше",
    summary: "Техническая проработка за 24 ч · предложение по спецификации за 3 рабочих дня",
  },
];

/**
 * EXACTLY THREE, ordered. The badge is TRANSLATED — "closed-up" is an EN-only
 * rule, because TR spells the unit as a word and RU takes a space before it.
 */
export const SLA_STEPS: { sort: number; text: SlaStepText[] }[] = [
  {
    sort: 1,
    text: [
      {
        locale: Locale.en,
        badge: "24h",
        title: "Technical review",
        description: "An engineer checks fit, spec & compliance.",
      },
      {
        locale: Locale.tr,
        badge: "24 saat",
        title: "Teknik değerlendirme",
        description: "Bir mühendis uygunluğu, şartnameyi ve mevzuata uyumu kontrol eder.",
      },
      {
        locale: Locale.ru,
        badge: "24 ч",
        title: "Техническая проработка",
        description: "Инженер проверяет соответствие, спецификацию и нормы.",
      },
    ],
  },
  {
    sort: 2,
    text: [
      {
        locale: Locale.en,
        badge: "3 days",
        title: "Spec + proposal",
        description: "Itemised package for your exact scope.",
      },
      {
        locale: Locale.tr,
        badge: "3 gün",
        title: "Şartname + teklif",
        description: "Tam kapsamınıza göre kalemlendirilmiş paket.",
      },
      {
        locale: Locale.ru,
        badge: "3 дня",
        title: "Спецификация и предложение",
        description: "Постатейный пакет под ваш объём работ.",
      },
    ],
  },
  {
    sort: 3,
    text: [
      {
        locale: Locale.en,
        badge: SLA_ARROW_BADGE,
        title: "Formal quote",
        description: "Costed, with lead times & logistics.",
      },
      {
        locale: Locale.tr,
        badge: SLA_ARROW_BADGE,
        title: "Resmi teklif",
        description: "Fiyatlandırılmış; termin ve lojistik dahil.",
      },
      {
        locale: Locale.ru,
        badge: SLA_ARROW_BADGE,
        title: "Официальное предложение",
        description: "С ценой, сроками поставки и логистикой.",
      },
    ],
  },
];

/**
 * The rendered shape for one locale, for TESTS.
 *
 * ⚠️ TESTS MUST BUILD THEIR FIXTURES FROM THIS, never retype the sentences. A
 * hand-copied fixture is a second source of the copy — which is exactly what the
 * hygiene gate below exists to forbid, and it would (correctly) fail on it. This
 * is how a component test gets real copy without minting a duplicate.
 */
export function slaTextFor(locale: Locale) {
  const process = SLA_PROCESS_TEXT.find((t) => t.locale === locale);
  if (!process) throw new Error(`no SLA process text for ${locale}`);
  const steps = SLA_STEPS.map((step) => {
    const text = step.text.find((t) => t.locale === locale);
    if (!text) throw new Error(`no SLA step ${step.sort} text for ${locale}`);
    return { badge: text.badge, title: text.title, description: text.description };
  });
  return { kicker: process.kicker, summary: process.summary, steps };
}

/**
 * Every SLA SENTENCE that must exist in the content model and nowhere else in
 * application source.
 *
 * ⚠️ SENTENCES ONLY — BADGES AND TITLES ARE EXCLUDED, and the exclusion is
 * reasoned, not a convenience. "24h", "3 days", "Technical review", "Formal
 * quote" are short labels that occur innocently in prose: the first run of this
 * gate flagged the Turkish `Rfq.lead` for containing "Teknik değerlendirme",
 * which is simply how Turkish says "technical review" and belongs in that
 * sentence. Sweeping for short labels produces false positives, and a gate that
 * cries wolf gets weakened until it means nothing.
 *
 * What actually gets duplicated by copy-paste is the SENTENCE — the summary, the
 * kicker and the step descriptions — and those are long enough to be
 * unambiguous. The call-site sweep in the gate covers the other half: a
 * component still reading a deleted key is caught by name, not by copy.
 */
export function slaCopyNeedles(): string[] {
  const needles = new Set<string>();
  for (const text of SLA_PROCESS_TEXT) {
    needles.add(text.kicker);
    needles.add(text.summary);
  }
  for (const step of SLA_STEPS) {
    for (const text of step.text) {
      needles.add(text.description);
    }
  }
  return [...needles];
}
