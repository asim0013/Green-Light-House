import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

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
 * `prefillContext` (DB defaults — Story 3.4 owns attribution, Task 0 #7), and
 * ALL six attachment columns (Story 3.7b's) are absent from this type, so a
 * handler bug that tried to supply one is a compile error, not a review finding.
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
>;

export interface CreatedLead {
  /** The human-quotable `GLH-RFQ-<digits>` handle the confirmation echoes. */
  reference: string;
}

/**
 * Insert one lead and return ONLY the DB-minted reference. `select` keeps the
 * response surface minimal on purpose: the success payload 3.7a's honeypot must
 * later counterfeit is exactly `{ reference }`, and returning the full row here
 * would invite the handler to widen it.
 */
export async function createLead(data: LeadCreateData): Promise<CreatedLead> {
  return prisma.lead.create({ data, select: { reference: true } });
}
