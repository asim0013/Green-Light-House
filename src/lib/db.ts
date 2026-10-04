import { PrismaClient } from "@prisma/client";
import { leadsStoreIsSeparate, resolveLeadsDatabaseUrl } from "./leads-db-url";

/**
 * The PrismaClient instances (Story 1.2; `leadsDb` Story 5.3).
 *
 * A global is reused in dev so Next.js HMR doesn't exhaust the connection pool
 * by spawning a new client on every reload. Consume these ONLY from
 * `server/repositories/*` — never import Prisma directly in components or routes
 * (CLAUDE.md boundary rule).
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  leadsDb?: PrismaClient;
};

const log: ("warn" | "error")[] =
  process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

/** The main store: the catalog and everything that is not personal data. */
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log });

/**
 * What the leads store may be used for: the `Lead` model, the raw draw from
 * `lead_reference_seq` (the honeypot's burned reference), and lifecycle. Narrowed
 * on purpose — `leadsDb.product` is a COMPILE error, so catalog reads can never be
 * routed to the personal-data database by accident.
 */
export type LeadsClient = Pick<PrismaClient, "lead" | "$queryRaw" | "$disconnect">;

/**
 * The leads / personal-data store (Story 5.3 — FR47 data residency).
 *
 * When `LEADS_DATABASE_URL` names a DIFFERENT database, this is a second client on
 * it — every Lead read/write, the reference sequence and the backup export then
 * live in that region. Otherwise it IS `prisma` (the same instance, one pool), so
 * an unconfigured deployment behaves exactly as before this story.
 *
 * ⚠️ The leads database must carry the full schema (the `leads` table AND
 * `lead_reference_seq`): run `prisma migrate deploy` against BOTH URLs at deploy —
 * see docs/data-residency.md.
 */
export const leadsDb: LeadsClient =
  globalForPrisma.leadsDb ??
  (leadsStoreIsSeparate()
    ? new PrismaClient({ log, datasources: { db: { url: resolveLeadsDatabaseUrl()! } } })
    : prisma);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.leadsDb = leadsDb as PrismaClient;
}
