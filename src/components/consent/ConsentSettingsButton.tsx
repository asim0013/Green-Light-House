"use client";

import { useTranslations } from "next-intl";
import { CONSENT_OPEN_EVENT } from "./ConsentBanner";

/**
 * Footer "Cookie settings" control (Story 5.2 — KVKK/GDPR right to change a prior
 * choice). Dispatches the window event the `ConsentBanner` listens for, re-opening
 * the bar so the visitor can flip granted↔denied. On-dark styling — it sits in the
 * footer's Legal column (a `DarkBand`).
 */
export function ConsentSettingsButton() {
  const t = useTranslations("Consent");
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      className="text-left text-on-dark-text hover:text-white focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-white"
    >
      {t("settings")}
    </button>
  );
}
