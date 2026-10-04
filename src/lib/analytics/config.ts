/**
 * Analytics config (Story 5.8 — Decision 1: Plausible, self-hosted, cookieless,
 * SAME-ORIGIN PROXIED). The script and the event endpoint are served from THIS
 * origin (Next `rewrites()` → `PLAUSIBLE_HOST`), so the strict Story 5.7 CSP
 * (`script-src 'self' … 'strict-dynamic'`, `connect-src 'self'`) needs NO
 * third-party origin — FR46's "no third-party origins" stays true.
 *
 * ⚠️ Safe default OFF: analytics exists only when the data-domain is configured,
 * so dev + CI + every un-provisioned environment run with it fully disabled.
 * `PLAUSIBLE_HOST` (the rewrite target) must be set together with
 * `NEXT_PUBLIC_ANALYTICS_DOMAIN`; if the domain is set but the host is not, the
 * proxied paths simply 404 and the site is unaffected (no events, no crash).
 *
 * ⚠️ BOTH ARE BUILD-TIME (review F1): the domain is inlined into the client bundle
 * and `rewrites()` is baked into routes-manifest.json. Enabling analytics in the
 * Docker image therefore needs the Dockerfile build args (wired in compose), and a
 * rebuild — setting them only in the runtime env does nothing.
 */

/**
 * Same-origin proxied paths. The SCRIPT path is DOTTED (`.js`) and the EVENT path
 * is under `/api` — both are excluded by the proxy matcher
 * (`/((?!api|_next|_vercel|.*\..*).*)`), so neither is locale-routed (hazard C2).
 * `next.config.ts` rewrites both to `PLAUSIBLE_HOST`.
 */
export const ANALYTICS_SCRIPT_PATH = "/hive/js/script.js";
export const ANALYTICS_EVENT_PATH = "/api/hive/event";

/** The data-domain Plausible attributes events to. Public, non-secret — safe to inline. */
export const ANALYTICS_DOMAIN = process.env.NEXT_PUBLIC_ANALYTICS_DOMAIN?.trim() ?? "";

/** Client gate: analytics is enabled only when a data-domain is configured. */
export function analyticsEnabled(domain: string = ANALYTICS_DOMAIN): boolean {
  return domain.trim().length > 0;
}
