import { SignJWT, jwtVerify } from "jose";

/**
 * The admin session (Story 4.1) — a stateless `jose`-signed JWT in an httpOnly
 * cookie. There is deliberately NO session table (see `AdminUser` docstring):
 * the only server-persisted auth state is the admin row + hashed reset token.
 *
 * ⚠️ EDGE-SAFE. `jose` runs in the edge middleware runtime, so `src/proxy.ts`
 * can verify the cookie without a Node runtime. This module imports nothing that
 * isn't edge-compatible (no `hash-wasm`, no Prisma).
 */
export const SESSION_COOKIE = "glh_admin_session";
const ALG = "HS256";
const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h working session

export interface AdminSession {
  /** `AdminUser.id`. */
  sub: string;
}

/**
 * ⚠️ `AUTH_SECRET` MUST be set and ≥32 bytes, or signing/verifying REFUSES.
 * HS256 needs a 256-bit key; a short or missing secret is a fail-closed config
 * error, never a silently weak signature.
 */
function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("AUTH_SECRET is missing or shorter than 32 bytes — refusing to sign/verify.");
  }
  return new TextEncoder().encode(secret);
}

/** Sign a session JWT for an admin id. */
export async function signSession(adminId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALG })
    .setSubject(adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());
}

/** Verify a session token → the session, or null on any failure (expired, tampered, bad alg). */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<AdminSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [ALG] });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? { sub: payload.sub } : null;
  } catch {
    return null;
  }
}

/** Cookie attributes for the session — httpOnly, Secure in prod, SameSite=Lax. */
export function sessionCookieOptions(maxAgeSeconds: number = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
