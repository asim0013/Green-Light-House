import {
  findResetStateByEmail,
  setResetToken,
  completeReset,
} from "@/server/repositories/admin-user";
import { hashSecret, verifySecret } from "./password";

/**
 * Password reset (Story 4.1 — FR39a). Node-runtime only (pulls hashing + repo).
 *
 * ⚠️ THE RAW TOKEN IS NEVER PERSISTED. `issueReset` returns it once (for the
 * email link); only its argon2id hash and an expiry go to the DB. `consumeReset`
 * verifies the presented token against that hash, and on success sets the new
 * password AND clears the reset columns — single use.
 *
 * ⚠️ NON-ENUMERATION (NFR6). `issueReset` returns null for an unknown email and
 * the caller responds identically either way. `consumeReset` returns a plain
 * boolean; the route never says whether the email, the token, or the expiry was
 * the problem.
 */
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

/** A URL-safe single-use token. */
function newToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

/**
 * Issue a reset for `email`. Returns the RAW token (email it, never store it) or
 * null if no admin has that email. Overwrites any prior outstanding reset.
 *
 * ⚠️ NON-ENUMERATION IS TIMING, NOT JUST SHAPE (review finding). The token hash
 * is an argon2id call — tens of ms — so returning early on an unknown email
 * would make "no such account" measurably faster and leak existence. Both paths
 * therefore run one `hashSecret`: the known path hashes the real token, the
 * unknown path burns an equal-cost hash and discards it. (The route sends the
 * email WITHOUT awaiting it, so its network latency is not a distinguisher.)
 */
export async function issueReset(email: string): Promise<string | null> {
  const admin = await findResetStateByEmail(email);
  const token = newToken();
  const tokenHash = await hashSecret(token); // paid on BOTH paths — see note above
  if (!admin) return null;
  await setResetToken(admin.id, tokenHash, new Date(Date.now() + RESET_TTL_MS));
  return token;
}

/**
 * Consume a reset: verify (email, token) against the stored hash + expiry and,
 * if valid, set the new password hash and clear the reset. Returns false on any
 * failure — unknown email, no outstanding reset, expired, or wrong token.
 */
export async function consumeReset(
  email: string,
  token: string,
  newPassword: string,
): Promise<boolean> {
  const admin = await findResetStateByEmail(email);
  if (!admin || !admin.resetTokenHash || !admin.resetExpiresAt) return false;
  if (admin.resetExpiresAt.getTime() < Date.now()) return false;
  const ok = await verifySecret(token, admin.resetTokenHash);
  if (!ok) return false;
  await completeReset(admin.id, await hashSecret(newPassword));
  return true;
}
