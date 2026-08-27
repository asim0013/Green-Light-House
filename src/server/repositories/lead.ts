import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { deleteObject } from "@/lib/storage";
import { PENDING_MAX_AGE_MS } from "@/lib/lead-attachment";

/**
 * Lead writes (Story 3.2 — FR27/FR29's persist-first half).
 *
 * UNCACHED, DELIBERATELY, IN BOTH DIRECTIONS. Persist-first is a durability
 * property, not a cache property: success IS the Prisma commit, so there is no
 * read to cache and no tag to purge — 3.2 adds NO `leads` cache tag, and the
 * admin list (Story 4.7) owns any future caching decision. This module also
 * imports no Redis client: the only failure that loses a submission is Postgres
 * itself failing the insert.
 */

/**
 * The columns the RFQ endpoint may write — and, by omission, the ones it may
 * NOT. `reference` (DB-minted from `lead_reference_seq`) and `status` are absent
 * from this type, so a handler bug that tried to supply one is a compile error,
 * not a review finding.
 *
 * WIDENED BY TWO IN STORY 3.4 — `source` and `prefillContext`, the attribution
 * columns 3.0 shipped as DB defaults and named this story as the owner of.
 *
 * ⚠️ WIDENING THIS TYPE DOES NOT MEAN THE CLIENT MAY SUPPLY THEM, and the
 * distinction is the whole security argument. A browser cannot be trusted to
 * report its own provenance: a body carrying `source: "project"` would let any
 * client forge attribution in Story 4.7's leads list. `rfqSchema` still STRIPS a
 * client-supplied `source` (it is not in the schema), and the handler still
 * refuses it — what the client sends is the ORIGINAL PARAMS, from which the
 * server RE-RESOLVES both columns through the same `resolvePrefillSource` the
 * page used. The `route.test.ts` assertion that a smuggled `source` never
 * reaches these args stays GREEN, and it is the proof this holds.
 *
 * WIDENED BY EXACTLY SIX IN STORY 3.7b — the attachment columns, which the
 * endpoint now writes in the SAME insert as the lead. That "same insert" is the
 * whole design: `attachment_scan_status` being nullable means "no attachment",
 * NEVER "unscanned" (schema.prisma:65-67), so a row that HAS a key and no
 * terminal state must be unreachable. Writing the lead first and patching the
 * attachment in afterwards would make it reachable on every crash between the
 * two statements; one insert makes it impossible.
 */
export type LeadCreateData = Pick<
  Prisma.LeadUncheckedCreateInput,
  | "industry"
  | "equipment"
  | "projectDetails"
  | "quantities"
  | "timeline"
  | "company"
  | "name"
  | "email"
  | "phone"
  | "country"
  | "locale"
  | "consent"
  | "consentAt"
  | "consentVersion"
  | "attachmentKey"
  | "attachmentName"
  | "attachmentMime"
  | "attachmentSizeBytes"
  | "attachmentScanStatus"
  | "attachmentScannedAt"
  | "source"
  | "prefillContext"
>;

export interface CreatedLead {
  /**
   * The row's primary key. Story 3.3's `rfq.submitted` job carries THIS and
   * nothing else — the worker re-reads the row, so a job that outlives a deploy
   * sends current truth rather than a stale snapshot.
   */
  id: string;
  /** The human-quotable `GLH-RFQ-<digits>` handle the confirmation echoes. */
  reference: string;
}

/**
 * Insert one lead and return the id and the DB-minted reference.
 *
 * ⚠️ THE SELECT WIDENED IN STORY 3.3, AND THE OLD DOCSTRING FORBADE IT — so
 * here is why the reason no longer applies. It read: "`select` keeps the
 * response surface minimal on purpose: the success payload the honeypot path
 * counterfeits is exactly `{ reference }`, and returning the full row here
 * would invite the handler to widen it." The concern was the HTTP RESPONSE, and
 * the response is unchanged: `POST /api/rfq` still answers exactly
 * `{ reference }`, because the honeypot's fabricated 201 must stay
 * byte-identical to a real one. The `id` never leaves the server — it feeds the
 * JOB. Two different surfaces; only one of them is public.
 */
export async function createLead(data: LeadCreateData): Promise<CreatedLead> {
  return prisma.lead.create({ data, select: { id: true, reference: true } });
}

/**
 * Burn one `lead_reference_seq` value and return it formatted — the honeypot
 * path's fake reference (Story 3.7a, Task 0 #1). Burning a REAL nextval is what
 * makes the fake globally unique among all references past and future (a
 * burned value can never be re-issued), byte-identical in format, and
 * collision-proof — a made-up number could later collide with a genuine lead a
 * buyer quotes on the phone. Sequence gaps are sanctioned doctrine
 * (schema.prisma's `Lead.reference` note): never diagnose one as a lost lead.
 */
export async function burnLeadReference(): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('lead_reference_seq')`;
  return `GLH-RFQ-${rows[0].nextval}`;
}

/**
 * Erase one lead AND its attachment (Story 3.7b, AC10 — FR45's primitive).
 *
 * ⚠️ THE OBJECT GOES FIRST, AND THE ORDER IS THE WHOLE POINT. Deleting the row
 * first leaves an object that NO row references: unfindable by any query, and
 * therefore un-erasable — strictly worse than not deleting at all, because the
 * data subject's own file quietly survives their erasure request. Object-first
 * leaves at worst a row pointing at a gone key, which is a state the read paths
 * already handle as a miss and an operator can actually see.
 *
 * If the object delete THROWS, the row is kept and the error propagates: a
 * half-done erasure that reports success is the failure mode this ordering
 * exists to prevent. S3 DELETE is idempotent, so a retry is always safe.
 *
 * Story 4.7 builds the admin UI on top of this. 3.7b ships the primitive and
 * writes the rationale down rather than leaving the ordering to be rediscovered.
 */
export async function deleteLeadWithAttachment(id: string): Promise<void> {
  const lead = await prisma.lead.findUnique({ where: { id }, select: { attachmentKey: true } });
  if (!lead) return;
  if (lead.attachmentKey) await deleteObject(lead.attachmentKey);
  await prisma.lead.delete({ where: { id } });
}

/**
 * Housekeeping for AC11's stuck-`pending` rule: flip every attachment that has
 * been `pending` longer than `PENDING_MAX_AGE_MS` to `failed`, stamping
 * `attachmentScannedAt` so the row records when the question was settled.
 *
 * NOTHING CALLS THIS IN STORY 3.7b, and that is honest rather than an omission:
 * the scan is synchronous, so this story never writes `pending` at all. The
 * GUARANTEE — that a stale pending is never presented as downloadable — lives
 * in `toLeadAttachmentView`, which DERIVES it and therefore cannot depend on a
 * sweeper having run. This function only makes the stored state agree with what
 * readers already see, for whenever Story 3.3's worker starts writing `pending`.
 */
export async function expireStalePendingScans(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - PENDING_MAX_AGE_MS);
  const result = await prisma.lead.updateMany({
    where: { attachmentScanStatus: "pending", createdAt: { lt: cutoff } },
    data: { attachmentScanStatus: "failed", attachmentScannedAt: now },
  });
  if (result.count > 0) {
    console.warn(`[rfq-attach] ${result.count} stale pending scan(s) expired to failed`);
  }
  return result.count;
}

/**
 * Which of the two sends a failure belongs to (Story 3.3, Task 0 #7).
 *
 * `deliveryFailureReason` is ONE column serving TWO independent sends, so a
 * bare code could never say which one failed. The prefix makes the column
 * self-sufficient for Story 4.7's admin view, which renders it through i18n —
 * hence CODES, never English prose, the same doctrine that keeps
 * `Lead.industry` a slug rather than a translated label.
 */
export const DELIVERY_KINDS = ["notify", "confirm"] as const;
export type DeliveryKind = (typeof DELIVERY_KINDS)[number];

/**
 * Stable failure codes. `provider` = the provider answered non-2xx;
 * `transport` = the request never got an answer (network, timeout, DNS);
 * `unconfigured` = we had nowhere to send it (no recipient or no API key),
 * which is a deployment fault rather than a transient one and is therefore
 * never worth retrying.
 */
export const DELIVERY_FAILURE_CODES = ["provider", "transport", "unconfigured"] as const;
export type DeliveryFailureCode = (typeof DELIVERY_FAILURE_CODES)[number];

/** `notify:provider`, `confirm:transport`, … — the frozen wire format. */
export function deliveryFailure(kind: DeliveryKind, code: DeliveryFailureCode): string {
  return `${kind}:${code}`;
}

/** The lead fields the worker needs to compose both emails and to decide what
 *  it has already done. Deliberately explicit: a `select` that drifted into
 *  `include`-everything would start carrying columns the emails must not use. */
export const LEAD_EMAIL_SELECT = {
  id: true,
  reference: true,
  name: true,
  company: true,
  email: true,
  phone: true,
  country: true,
  industry: true,
  timeline: true,
  equipment: true,
  quantities: true,
  projectDetails: true,
  locale: true,
  createdAt: true,
  attachmentName: true,
  attachmentMime: true,
  attachmentSizeBytes: true,
  attachmentScanStatus: true,
  notifiedAt: true,
  confirmationSentAt: true,
  deliveryFailureReason: true,
} as const;

export type LeadForEmail = Prisma.LeadGetPayload<{ select: typeof LEAD_EMAIL_SELECT }>;

/** Re-read a lead for sending. `null` when the row is gone — a job for a
 *  deleted lead must COMPLETE, not retry until the attempt budget burns out. */
export async function findLeadForEmail(id: string): Promise<LeadForEmail | null> {
  return prisma.lead.findUnique({ where: { id }, select: LEAD_EMAIL_SELECT });
}

/**
 * Stamp one send as done (Story 3.3, AC9's short-circuit half).
 *
 * The stamp is what makes a retry skip work already performed: the ordering is
 * provider-accept → stamp → (both sends done) → complete the job. The residual
 * is disclosed rather than claimed away — a crash BETWEEN the provider's accept
 * and this stamp re-sends that one email on the next attempt. That window is
 * at-least-once by construction; the provider-side `Idempotency-Key` narrows it,
 * and nothing short of a distributed transaction with the provider closes it.
 */
export async function markDeliverySent(id: string, kind: DeliveryKind, at: Date): Promise<void> {
  // ⚠️ A SUCCESSFUL SEND CLEARS THAT KIND'S FAILURE REASON, and the original
  // never did. A lead that failed terminally and was later re-driven kept its
  // stale `notify:provider` forever: Story 4.7 would render a delivered lead as
  // failed, and any reason-based recovery predicate — including the widened one
  // below — would keep re-finding a lead that is already done. The other kind's
  // entry is preserved, for the same reason `recordDeliveryFailure` accumulates.
  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { deliveryFailureReason: true },
  });
  const kept = (existing?.deliveryFailureReason ?? "")
    .split(";")
    .filter((part) => part.trim() !== "" && part.split(":")[0] !== kind);
  await prisma.lead.update({
    where: { id },
    data: {
      ...(kind === "notify" ? { notifiedAt: at } : { confirmationSentAt: at }),
      deliveryFailureReason: kept.length > 0 ? kept.join(";") : null,
    },
  });
}

/**
 * Record a TERMINAL delivery failure (AC8). Called only once the retry budget
 * is exhausted — a mid-retry failure records nothing, because the job is still
 * expected to succeed and a reason column that flickered would mislead 4.7.
 *
 * Reasons accumulate rather than overwrite: when both sends fail terminally the
 * column carries `notify:<code>;confirm:<code>`, so neither failure hides the
 * other. Re-recording the same kind replaces just that kind's entry.
 */
export async function recordDeliveryFailure(id: string, reason: string): Promise<void> {
  const existing = await prisma.lead.findUnique({
    where: { id },
    select: { deliveryFailureReason: true },
  });
  const kind = reason.split(":")[0];
  const kept = (existing?.deliveryFailureReason ?? "")
    .split(";")
    .filter((part) => part.trim() !== "" && part.split(":")[0] !== kind);
  await prisma.lead.update({
    where: { id },
    data: { deliveryFailureReason: [...kept, reason].join(";") },
  });
}

/**
 * The enqueue-failure recovery query (AC10 — `npm run queue:replay`).
 *
 * A lead needing replay has `notifiedAt` null and is old enough that it is not
 * still legitimately in flight. The question is which FAILURE REASONS are still
 * replayable, and the original answered "only a null one".
 *
 * ⚠️ THAT ANSWER STRANDED AN ENTIRE CLASS OF LEAD, AND FOUR LENSES FOUND IT.
 * `unconfigured` means "we never tried" — no `RFQ_NOTIFY_TO`, no API key, a
 * transport that delivers nothing — so the flow records it immediately and does
 * NOT retry, which means the job COMPLETES. A completed job is not in the failed
 * set, so `queue:retry` cannot see it; and the reason it just wrote is non-null,
 * so `queue:replay` could not see it either. Fixing the deployment afterwards
 * recovered nothing and surfaced nothing.
 *
 * So the predicate keys on the CODE, not on null: `unconfigured` is replayable
 * by definition, while `provider` and `transport` are genuine terminal failures
 * that belong to `queue:retry`. This is double-send-safe because the worker
 * short-circuits per email on `notifiedAt`/`confirmationSentAt`.
 */
export async function findLeadsAwaitingNotification(
  olderThan: Date,
  limit = 100,
): Promise<{ id: string; reference: string; createdAt: Date }[]> {
  return prisma.lead.findMany({
    where: {
      notifiedAt: null,
      createdAt: { lt: olderThan },
      OR: [
        { deliveryFailureReason: null },
        // Never attempted rather than failed — see above. `contains` rather
        // than equality because the column carries BOTH kinds' entries joined
        // by `;`, e.g. `notify:unconfigured;confirm:provider`.
        { deliveryFailureReason: { contains: "notify:unconfigured" } },
      ],
    },
    select: { id: true, reference: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
