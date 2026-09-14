import { findAdminByEmail } from "@/server/repositories/admin-user";
import { hashSecret, verifySecret } from "./password";

/**
 * Credential verification (Story 4.1). Node-runtime only (pulls `hash-wasm` +
 * the repository).
 *
 * ⚠️ NON-ENUMERATION (NFR6). A missing email must be indistinguishable from a
 * wrong password — in both the RESPONSE (the caller returns one generic
 * "invalid credentials") and the TIMING. So when no admin matches we still run a
 * full argon2 verify against a cached dummy hash, spending the same work rather
 * than returning early. Never reveal which of the two failed.
 */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  // A hash of a throwaway string — not a secret; its only job is to cost the
  // same as a real verify so the no-such-email path is not faster.
  return (dummyHashPromise ??= hashSecret("no-such-account-placeholder-secret"));
}

/** Returns the admin id on a correct credential, else null. Constant-ish time in both cases. */
export async function verifyCredential(
  email: string,
  password: string,
): Promise<{ id: string } | null> {
  const admin = await findAdminByEmail(email);
  if (!admin) {
    await verifySecret(password, await dummyHash()); // burn the time; no early return
    return null;
  }
  const ok = await verifySecret(password, admin.passwordHash);
  return ok ? { id: admin.id } : null;
}
