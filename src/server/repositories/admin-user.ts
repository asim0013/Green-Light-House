import { prisma } from "@/lib/db";

/**
 * AdminUser data access (Story 4.1). The ONLY module that touches the admin
 * table through Prisma (CLAUDE.md boundary rule). Callers get plain shapes, not
 * Prisma model objects, and NEVER the hashes unless they are doing verification.
 */

export interface AdminCredential {
  id: string;
  email: string;
  passwordHash: string;
}

export interface AdminResetState {
  id: string;
  resetTokenHash: string | null;
  resetExpiresAt: Date | null;
}

/** Look up the single admin by email (case-insensitive-safe: emails are stored lowercased). */
export async function findAdminByEmail(email: string): Promise<AdminCredential | null> {
  const row = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, email: true, passwordHash: true },
  });
  return row;
}

export async function findAdminById(id: string): Promise<{ id: string; email: string } | null> {
  return prisma.adminUser.findUnique({ where: { id }, select: { id: true, email: true } });
}

/** How many admins exist — bootstrap refuses to mint a second (single-admin invariant). */
export async function countAdmins(): Promise<number> {
  return prisma.adminUser.count();
}

/** Create the first admin (bootstrap). Email is lowercased; hash is pre-computed by the caller. */
export async function createAdmin(email: string, passwordHash: string): Promise<{ id: string }> {
  return prisma.adminUser.create({
    data: { email: email.trim().toLowerCase(), passwordHash },
    select: { id: true },
  });
}

/** Store a reset request (hashed token + expiry). One outstanding reset per admin. */
export async function setResetToken(
  id: string,
  resetTokenHash: string,
  resetExpiresAt: Date,
): Promise<void> {
  await prisma.adminUser.update({ where: { id }, data: { resetTokenHash, resetExpiresAt } });
}

/** The reset state for verification (the hash + expiry). */
export async function getResetState(id: string): Promise<AdminResetState | null> {
  return prisma.adminUser.findUnique({
    where: { id },
    select: { id: true, resetTokenHash: true, resetExpiresAt: true },
  });
}

/** Find the admin by email and return its reset state (request-reset entry point). */
export async function findResetStateByEmail(email: string): Promise<AdminResetState | null> {
  return prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, resetTokenHash: true, resetExpiresAt: true },
  });
}

/** Break-glass: set the password hash for an existing admin by email, clearing any pending reset. */
export async function setPasswordByEmail(email: string, passwordHash: string): Promise<boolean> {
  const res = await prisma.adminUser.updateMany({
    where: { email: email.trim().toLowerCase() },
    data: { passwordHash, resetTokenHash: null, resetExpiresAt: null },
  });
  return res.count > 0;
}

/** Consume a reset: set the new password hash and clear the reset columns (single-use). */
export async function completeReset(id: string, passwordHash: string): Promise<void> {
  await prisma.adminUser.update({
    where: { id },
    data: { passwordHash, resetTokenHash: null, resetExpiresAt: null },
  });
}
