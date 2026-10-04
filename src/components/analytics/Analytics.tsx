"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { readConsent, CONSENT_CHANGED_EVENT } from "@/lib/consent";
import {
  analyticsEnabled,
  ANALYTICS_DOMAIN,
  ANALYTICS_SCRIPT_PATH,
  ANALYTICS_EVENT_PATH,
} from "@/lib/analytics/config";
import { trackEvent, EVENT_PHONE } from "@/lib/analytics/track";

const SCRIPT_ID = "glh-plausible";
const IGNORE_KEY = "plausible_ignore"; // Plausible's official per-event opt-out flag

type PlausibleQueue = ((...args: unknown[]) => void) & { q?: unknown[] };

/**
 * Inject the cookieless Plausible script (Story 5.8). Created by the trusted (nonced)
 * React runtime, so `'strict-dynamic'` permits it WITHOUT a per-tag nonce — trust
 * propagates to scripts a trusted script loads. `data-api` points at the same-origin
 * proxied event path (`connect-src 'self'` covers it). The queue stub lets events
 * fired before the script finishes loading be flushed on load.
 */
function injectPlausible(): void {
  if (document.getElementById(SCRIPT_ID)) return; // once
  const w = window as unknown as { plausible?: PlausibleQueue };
  w.plausible =
    w.plausible ||
    function (...args: unknown[]) {
      (w.plausible!.q = w.plausible!.q || []).push(args);
    };
  const s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.defer = true;
  s.src = ANALYTICS_SCRIPT_PATH;
  s.setAttribute("data-domain", ANALYTICS_DOMAIN);
  s.setAttribute("data-api", ANALYTICS_EVENT_PATH);
  document.head.appendChild(s);
}

/**
 * Consent-gated analytics loader — Story 5.8 (FR31 measurement half, FR46). Mounted
 * once in `(public)/layout.tsx` (buyer-facing only; admin is outside the group).
 * Renders NOTHING.
 *
 * - Safe default OFF: if `NEXT_PUBLIC_ANALYTICS_DOMAIN` is unset, this is inert.
 * - Nothing loads before consent: the script is injected ONLY when `granted`.
 * - Live (AC4): re-syncs on `glh:consent-changed` — Accept-after-load injects with
 *   no reload; a later Decline sets `plausible_ignore` so the already-loaded script
 *   stops sending. The ignore flag is written ONLY when the script was actually
 *   loaded, so no storage is touched before consent.
 * - Conversion: one delegated `tel:` click listener + the RFQ fire in
 *   `RfqConfirmation`; both carry path+locale only (no PII), guarded in `trackEvent`.
 */
export function Analytics() {
  const locale = useLocale();

  useEffect(() => {
    if (!analyticsEnabled()) return;
    const sync = () => {
      if (readConsent() === "granted") {
        try {
          localStorage.removeItem(IGNORE_KEY);
        } catch {
          /* storage may be unavailable; ignore */
        }
        injectPlausible();
      } else if (document.getElementById(SCRIPT_ID)) {
        // Loaded under a prior grant, now revoked: stop it live without a reload.
        try {
          localStorage.setItem(IGNORE_KEY, "true");
        } catch {
          /* ignore */
        }
      }
    };
    sync();
    window.addEventListener(CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => {
    if (!analyticsEnabled()) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (el?.closest?.('a[href^="tel:"]')) {
        trackEvent(EVENT_PHONE, { path: location.pathname, locale });
      }
    };
    document.addEventListener("click", onClick, true); // capture — runs even if the anchor stops propagation
    return () => document.removeEventListener("click", onClick, true);
  }, [locale]);

  return null;
}
