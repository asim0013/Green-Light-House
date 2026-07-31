import { PrismaClient } from "@prisma/client";

/**
 * Single PrismaClient instance (Story 1.2).
 *
 * A global is reused in dev so Next.js HMR doesn't exhaust the connection pool
 * by spawning a new client on every reload. Consume this ONLY from
 * `server/repositories/*` — never import Prisma directly in components or routes
 * (CLAUDE.md boundary rule).
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
