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
 * NOT. `reference` (DB-minted from `lead_reference_seq`), `status`, `source` and
 * `prefillContext` (DB defaults — Story 3.4 owns attribution, Task 0 #7) are
 * absent from this type, so a handler bug that tried to supply one is a compile
 * error, not a review finding.
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
  await prisma.lead.update({
    where: { id },
    data: kind === "notify" ? { notifiedAt: at } : { confirmationSentAt: at },
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
 * A lead whose enqueue failed has the shape the schema docstring pins:
 * `notifiedAt` null (never sent) AND `deliveryFailureReason` null (never even
 * tried — a terminal failure would have written one). The age floor keeps the
 * replay off submissions still legitimately in flight.
 */
export async function findLeadsAwaitingNotification(
  olderThan: Date,
  limit = 100,
): Promise<{ id: string; reference: string; createdAt: Date }[]> {
  return prisma.lead.findMany({
    where: {
      notifiedAt: null,
      deliveryFailureReason: null,
      createdAt: { lt: olderThan },
    },
    select: { id: true, reference: true, createdAt: true },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}
