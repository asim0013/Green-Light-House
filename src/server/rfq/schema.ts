import { z } from "zod";
import { isValidSlug } from "@/lib/slug";
import { routing } from "@/i18n/routing";

/**
 * The RFQ submission schema (Story 3.2, AC2) — ONE zod module, BOTH sides.
 *
 * `RfqForm` (client) and `POST /api/rfq` (server) import THIS schema, so a
 * request that bypasses the client is rejected identically. The server is
 * authoritative; the client resolver is a convenience over the same rules.
 *
 * ERROR MESSAGES ARE STABLE KEYS, NEVER ENGLISH SENTENCES. `/api` sits outside
 * the next-intl proxy matcher, so the server has no locale scope — a hard-coded
 * message would ship EN to every buyer. Each issue's `message` is a key from
 * {@link RFQ_ERROR_KEYS}; the client renders `t(`errors.${key}`)` and the API
 * envelope carries `{ path, key }` so a direct caller can do the same.
 *
 * UNKNOWN KEYS ARE STRIPPED, DELIBERATELY (zod object default). Two consumers
 * depend on it: (1) Story 3.7a's honeypot field (`website`) travels IN the JSON
 * payload so the server can read it — it must not 422 here; (2) a body smuggling
 * `source`, `reference` or `status` must not reach the create args — stripping
 * plus the repository's narrowed input type make that structural.
 */

/** The keys the client maps through `t()`. Exported so tests pin the set. */
export const RFQ_ERROR_KEYS = [
  "required",
  "email",
  "tooLong",
  "invalid",
  "consentRequired",
  // Story 3.7b's attachment rejections (Task 0 #12). Each names ONE cause, so
  // the client can say what actually went wrong — epics:970 asks for "a message
  // naming the specific limit that was hit", which a shared generic key cannot
  // do. `scanFailed` deliberately covers BOTH "clamd found something" and
  // "clamd could not tell us": the buyer's next action is identical, and
  // separating them would report a signature match back to whoever sent it.
  "fileTooLarge",
  "fileType",
  "fileCorrupt",
  "scanFailed",
] as const;

export type RfqErrorKey = (typeof RFQ_ERROR_KEYS)[number];

/**
 * Timeline option KEYS (Task 0 #6). The stored value is the key, never a
 * translated label — the same doctrine as `Lead.industry`'s slug (a stored label
 * would lock the row to the buyer's locale). The set lives here, not in Postgres:
 * `Lead.timeline` is deliberately `String?` so this list can change without a
 * migration. Labels are `Rfq.timeline.<key>` in messages.
 */
export const TIMELINE_KEYS = ["asap", "1-3m", "3-6m", "6m-plus", "exploring"] as const;

export type TimelineKey = (typeof TIMELINE_KEYS)[number];

/**
 * Which privacy-policy text `consentVersion` cites (Task 0 #8 / FR44) — ONE
 * constant consumed by the /privacy page's version line AND the endpoint's
 * `consentVersion` stamp, so the two can never drift. BUMP THIS whenever the
 * `Legal` namespace's wording changes (the /privacy docstring carries the
 * rule). `-r2`: the 3.2 review added `industry` and `timeline` to the
 * disclosure — they were stored but undeclared. `-r3`: Story 3.7b added the
 * ATTACHMENT — its contents and its filename — for exactly the same reason,
 * surfaced by that story's guard audit rather than by the greps before it
 * (`Legal.collect` contains none of the words an attachment audit searches for).
 */
export const PRIVACY_POLICY_VERSION = "privacy-2026-08-stub-r3";

/**
 * Code points no legitimate buyer input contains, and which this stack cannot
 * store or render honestly (3.2 review, HIGH): U+0000 and most C0/DEL break the
 * Prisma insert itself (Postgres 22021/22P05 — a hostile body would mint the
 * 500 this route reserves for "Postgres down"), and the bidi embedding/override
 * set (U+202A–202E, U+2066–2069) lets a stored label visually spoof what
 * Story 4.7's admin reads. `\t`, `\n`, `\r` stay legal — projectDetails is a
 * textarea. Rejected (422 `invalid`), never stripped: "sanitized but never
 * corrected" means we refuse hostile bytes, we do not silently alter text.
 */
const HOSTILE_CODEPOINTS =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]/;

/**
 * Lone-surrogate scan, as a function rather than a lookbehind regex: this
 * module ships in the CLIENT bundle, and a lookbehind literal throws at parse
 * time on older engines — taking the whole form down to reject an edge case.
 * A lone surrogate cannot serialize to UTF-8, so Prisma throws pre-query.
 */
function hasLoneSurrogate(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      i++;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

/**
 * Exported for Story 3.7b: an attachment's ORIGINAL FILENAME is stored in
 * `Lead.attachmentName`, so it is subject to exactly the same rule as every
 * other stored string. A filename carrying a NUL would otherwise die inside
 * `prisma.lead.create` — the 3.2 review's hostile-code-point HIGH, reached
 * through a field that did not exist when that fix was written.
 */
export function isStorableText(value: string): boolean {
  return !HOSTILE_CODEPOINTS.test(value) && !hasLoneSurrogate(value);
}

/** Bounded free text: trimmed, capped, empty-after-trim rejected, hostile
 *  code points rejected (see `HOSTILE_CODEPOINTS`). */
function requiredText(max: number) {
  return z
    .string("required")
    .trim()
    .min(1, "required")
    .max(max, "tooLong")
    .refine(isStorableText, "invalid");
}

/** Bounded optional free text. `""` survives parsing; the handler stores null.
 *  NOTE FOR DIRECT CALLERS (the client's `normalize` hides this): empty strings
 *  are valid-and-nulled on free-text optionals but 422-`invalid` on the
 *  slug/enum optionals (`industry`, `timeline`) — send `undefined`/omit for
 *  "absent", never `""`. */
function optionalText(max: number) {
  return z
    .string("invalid")
    .trim()
    .max(max, "tooLong")
    .refine(isStorableText, "invalid")
    .optional();
}

/**
 * Slug-gated string: the shared shape+length gate (`isValidSlug`), so a
 * malformed value never reaches a query, a cache key, or a JSONB column.
 */
const slug = z.string("invalid").refine(isValidSlug, "invalid");

/**
 * The INPUT shape of `LeadEquipmentItem` (the frozen contract in
 * `./contracts.ts`) — same discriminator, same fields, expressed as zod so the
 * boundary can reject rather than merely narrow. Labels are bounded here; the
 * SERVER re-resolves display names for `product`/`category` kinds at submit time
 * (AC4 snapshot semantics), so a client label is only ever a fallback.
 */
const equipmentItem = z.discriminatedUnion(
  "kind",
  [
    z.object({ kind: z.literal("product"), slug, label: requiredText(300) }),
    z.object({ kind: z.literal("category"), slug, label: requiredText(300) }),
    z.object({ kind: z.literal("freeText"), text: requiredText(300) }),
  ],
  "invalid",
);

/**
 * The submission payload. Field notes:
 *
 * - `industry` is optional and slug-gated HERE; membership in the actual PID
 *   industry list is the HANDLER's re-validation (it owns the DB read — this
 *   module must stay importable from the client bundle, so it can never touch
 *   a repository).
 * - `locale` is the PREFERRED REPLY LANGUAGE (Task 0 #8) — the `Lead.locale`
 *   column, nothing else.
 * - `uiLocale` is the locale of the page the consent text was SHOWN in. It
 *   exists because FR44 wants "which policy text was shown" and the reply
 *   language above can legitimately differ from it (an EN page, an RU reply).
 *   The server composes `consentVersion = "privacy-2026-08-stub:<uiLocale>"`
 *   from it — the client never supplies a `consentVersion` string, which would
 *   let a direct POST write arbitrary text into the column.
 * - `consent` is `z.literal(true)`: refusal is a field-level 422 issue like any
 *   other, and the Prisma create is unreachable without it (AC4 — a
 *   `consent: false` direct POST writes NO row).
 */
export const rfqSchema = z.object({
  industry: slug.optional(),
  timeline: z.enum(TIMELINE_KEYS, "invalid").optional(),
  equipment: z.array(equipmentItem, "invalid").max(20, "tooLong").default([]),
  projectDetails: optionalText(5000),
  quantities: optionalText(1000),
  name: requiredText(200),
  company: requiredText(200),
  // Pre-trimmed: a trailing space (the phone-keyboard autocomplete gift) must
  // not reject an otherwise valid address (3.2 review).
  email: z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    z.email("email").max(320, "tooLong"),
  ),
  phone: optionalText(40),
  country: optionalText(120),
  locale: z.enum(routing.locales, "invalid"),
  uiLocale: z.enum(routing.locales, "invalid"),
  consent: z.literal(true, "consentRequired"),
  /**
   * THE DOORWAY THE BUYER CAME THROUGH (Story 3.4, AC9) — the ORIGINAL PARAMS,
   * never a conclusion drawn from them.
   *
   * ⚠️ THIS IS THE SECURITY-RELEVANT SHAPE IN THIS SCHEMA. `Lead.source` and
   * `Lead.prefillContext` feed Story 4.7's admin, and a browser cannot be
   * trusted to report its own provenance — a body claiming `source: "project"`
   * would let any client forge attribution. So there is deliberately NO `source`
   * field here: the client sends the slugs it was given, the server RE-RESOLVES
   * both columns from them through the same code the page used, and a smuggled
   * `source` is stripped as an unknown key exactly as `reference` and `status`
   * are.
   *
   * Every slug is re-gated by `slug` rather than trusted from the client, so a
   * direct POST cannot write an unvalidated value into the JSONB column either.
   * `cleared` records that the buyer pressed Clear — a real signal about intent
   * that only the client can know.
   */
  prefill: z
    .object({
      project: slug.optional(),
      product: slug.optional(),
      industry: slug.optional(),
      category: slug.optional(),
      // 80 == `SEARCH_QUERY_MAX_LENGTH` (`@/server/catalog-page`), spelled as a
      // literal rather than imported: this module is bundled into the CLIENT
      // island, and `catalog-page` reaches Prisma through the repositories.
      q: optionalText(80),
      cleared: z.boolean().default(false),
    })
    .optional(),
});

export type RfqInput = z.infer<typeof rfqSchema>;

/**
 * One issue → one `{ path, key }` pair (architecture § Format: the 422 envelope's
 * `details`). `path` is dot-joined (`equipment.2.label`); `key` is the stable
 * error key the schema put in `message`.
 */
export function issueDetails(error: z.ZodError): { path: string; key: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    key: issue.message,
  }));
}
