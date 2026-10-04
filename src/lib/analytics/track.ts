import { readConsent } from "@/lib/consent";

type PlausibleFn = (event: string, options?: { props?: Record<string, string> }) => void;

/**
 * Send a conversion event — Story 5.8 (FR31 measurement half). NO-OP unless consent
 * is `granted` — defence in depth: the Plausible script is absent without consent,
 * but every fire re-checks so a race or a stale reference can never leak an event.
 *
 * Props carry ONLY the page path + locale — never a phone number, name, email or
 * RFQ reference (AC3: "no personal data"). Delegates to the injected Plausible
 * queue/sender (`window.plausible`), which POSTs to the same-origin proxied
 * `/api/hive/event` — so no third-party request and the strict CSP is satisfied.
 */
export function trackEvent(name: string, props: { path: string; locale: string }): void {
  if (readConsent() !== "granted") return;
  if (typeof window === "undefined") return;
  const plausible = (window as unknown as { plausible?: PlausibleFn }).plausible;
  plausible?.(name, { props });
}

/** Event names — kept here so the loader, the senders and the tests agree. */
export const EVENT_PHONE = "Phone";
export const EVENT_RFQ = "RFQ";
