import { argon2id, argon2Verify } from "hash-wasm";

/**
 * Password + reset-token hashing (Story 4.1) — argon2id via `hash-wasm`.
 *
 * ⚠️ WHY `hash-wasm` AND NOT `@node-rs/argon2`. The native `@node-rs/argon2`
 * binding cannot load on the dev box (Node 24 / Windows — missing VC++ runtime
 * or ABI mismatch) and its WASM-WASI fallback is broken on Node 24
 * (`bridge.setLastError`). `hash-wasm` is pure WASM (no native, no WASI), so it
 * behaves identically on the dev box, in CI and in production — the same
 * argon2id algorithm the architecture chose (architecture:92, "argon2/bcrypt").
 *
 * ⚠️ NODE-RUNTIME ONLY. This module is imported by the login/reset route
 * handlers, never by `src/proxy.ts` — the edge middleware only VERIFIES the
 * session JWT (jose), it never hashes. Keeping hashing out of the proxy keeps
 * argon2's cost off every request.
 *
 * Parameters follow the OWASP argon2id baseline (m=19 MiB, t=2, p=1). The
 * encoded output carries the salt + params, so `verify` needs only the hash.
 */
const ARGON2_PARAMS = { parallelism: 1, iterations: 2, memorySize: 19456, hashLength: 32 } as const;

/** A fresh 16-byte random salt per hash (Web Crypto — present in Node 24 + edge). */
function randomSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Hash a secret (password or reset token) → argon2id encoded string. */
export async function hashSecret(secret: string): Promise<string> {
  return argon2id({
    password: secret,
    salt: randomSalt(),
    outputType: "encoded",
    ...ARGON2_PARAMS,
  });
}

/**
 * Verify a secret against an argon2id encoded hash. Returns false (never throws)
 * on a malformed hash, so a corrupt row is a failed login, not a 500.
 *
 * ⚠️ TIMING. `argon2Verify` recomputes the hash, so a wrong password and a right
 * one take comparable time. Account NON-existence is handled at the call site
 * with a dummy verify (see `lib/auth/login`), so "no such email" and "wrong
 * password" are indistinguishable (NFR6 — no enumeration).
 */
export async function verifySecret(secret: string, hash: string): Promise<boolean> {
  try {
    return await argon2Verify({ password: secret, hash });
  } catch {
    return false;
  }
}
