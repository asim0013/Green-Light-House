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
