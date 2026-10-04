/**
 * Cookie-consent primitive (Story 5.2 — FR46).
 *
 * ONE essential cookie, `glh-consent`, stores the visitor's choice for the single
 * non-essential category this site has: analytics (Story 5.8, Plausible). No
 * choice ⇒ `null` ⇒ treated as DENIED (privacy-first default). Story 5.8's loader
 * imports `readConsent()` and loads analytics only on `"granted"`.
 *
 * NOT httpOnly — the client analytics loader must read it. Essential (stores a
 * necessary preference), so it is allowed without consent.
 */
export const CONSENT_COOKIE = "glh-consent";

export type ConsentChoice = "granted" | "denied";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // ~180 days

/**
 * The ONE predicate for "is this a valid, recorded choice". Shared by `parseConsent`
 * (client) AND the server layout's `initialShow` decision so the two never drift —
 * the split-predicate class this project keeps re-introducing (review 5.2 #4).
 */
export function isConsentChoice(value: unknown): value is ConsentChoice {
  return value === "granted" || value === "denied";
}

/** `Secure` only over https (so http dev still sets the cookie). Extracted to be unit-testable (review 5.2 #2). */
export function isSecureContext(protocol: string | undefined): boolean {
  return protocol === "https:";
}

/** Parse a `document.cookie`-style string. Unknown/absent ⇒ null (never implicit consent). */
export function parseConsent(cookieString: string): ConsentChoice | null {
  const entry = cookieString
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`));
  const value = entry?.slice(CONSENT_COOKIE.length + 1);
  return isConsentChoice(value) ? value : null;
}

/** The exact cookie string to assign to `document.cookie`. Pure, for testability. */
export function consentCookieString(choice: ConsentChoice, opts: { secure: boolean }): string {
  return (
    `${CONSENT_COOKIE}=${choice}; Path=/; Max-Age=${MAX_AGE_SECONDS}; SameSite=Lax` +
    (opts.secure ? "; Secure" : "")
  );
}

/** Current choice, or null (= denied) — client only. */
export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  return parseConsent(document.cookie);
}

/** Persist a choice — client only. */
export function writeConsent(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  const secure = isSecureContext(typeof location !== "undefined" ? location.protocol : undefined);
  document.cookie = consentCookieString(choice, { secure });
}
