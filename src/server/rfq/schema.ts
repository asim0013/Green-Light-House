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

/** Bounded free text: trimmed, capped, and empty-after-trim is rejected. */
function requiredText(max: number) {
  return z.string("required").trim().min(1, "required").max(max, "tooLong");
}

/** Bounded optional free text. `""` survives parsing; the handler stores null. */
function optionalText(max: number) {
  return z.string("invalid").trim().max(max, "tooLong").optional();
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
  email: z.email("email").max(320, "tooLong"),
  phone: optionalText(40),
  country: optionalText(120),
  locale: z.enum(routing.locales, "invalid"),
  uiLocale: z.enum(routing.locales, "invalid"),
  consent: z.literal(true, "consentRequired"),
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
