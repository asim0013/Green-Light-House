import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken, type AdminSession } from "./session";

/**
 * Server-side session access (Story 4.1). The per-mutation / per-route defense
 * that backs up the `src/proxy.ts` redirect — the middleware guards page
 * navigations, but every admin route handler and Server Action must ALSO check,
 * because the matcher excludes `/api` and defence-in-depth is the rule
 * (architecture:137, NFR6).
 */

/** The current admin session from the request cookies, or null. */
export async function getAdminSession(): Promise<AdminSession | null> {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Thrown by `requireAdmin` when there is no valid session — route handlers map it to 401. */
export class AuthRequiredError extends Error {
  constructor() {
    super("admin authentication required");
    this.name = "AuthRequiredError";
  }
}

/** Return the session or throw `AuthRequiredError` — for route handlers / Server Actions. */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new AuthRequiredError();
  return session;
}
