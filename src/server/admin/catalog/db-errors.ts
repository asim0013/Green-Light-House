import { Prisma } from "@prisma/client";

/**
 * Is `err` a Prisma unique-constraint violation (P2002), optionally on `field`?
 * (Story 4.3) — lets a mutation body turn a racing duplicate-slug insert into a
 * clean mapped `slugInvalid` result rather than a 500. The write path is the
 * authoritative uniqueness gate; a pre-check would still race.
 */
export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return false;
  if (!field) return true;
  const target = err.meta?.target;
  if (Array.isArray(target)) return target.includes(field);
  if (typeof target === "string") return target.includes(field);
  return true;
}
