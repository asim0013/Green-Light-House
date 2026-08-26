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
  /** The human-quotable `GLH-RFQ-<digits>` handle the confirmation echoes. */
  reference: string;
}

/**
 * Insert one lead and return ONLY the DB-minted reference. `select` keeps the
 * response surface minimal on purpose: the success payload the honeypot path
 * counterfeits (Story 3.7a) is exactly `{ reference }`, and returning the full
 * row here would invite the handler to widen it.
 */
export async function createLead(data: LeadCreateData): Promise<CreatedLead> {
  return prisma.lead.create({ data, select: { reference: true } });
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
