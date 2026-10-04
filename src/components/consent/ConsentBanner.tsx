"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { CONTAINER } from "@/components/layout/container";
import { writeConsent, type ConsentChoice } from "@/lib/consent";

/** Window event the footer "Cookie settings" control dispatches to re-open the bar. */
export const CONSENT_OPEN_EVENT = "glh:consent-open";

/**
 * The cookie-consent bar (Story 5.2 — FR46). Privacy-first + NON-BLOCKING: a visitor
 * can use the site without choosing, and no choice ⇒ denied (the loader in Story 5.8
 * reads `glh-consent` and treats null as denied). Accept and Decline are equally
 * prominent — no dark patterns.
 *
 * ⚠️ `initialShow` is computed on the SERVER (the layout reads the cookie) so there
 * is no flash of a banner that then vanishes. The bar re-opens on the
 * `CONSENT_OPEN_EVENT` window event (the footer "Cookie settings" control) so a prior
 * choice can be changed (KVKK/GDPR).
 *
 * First-party only — no inline handlers/styles — so the enforcing CSP (Story 5.7) is
 * satisfied. `fixed` bottom so it never pushes content or shifts layout.
 */
export function ConsentBanner({ initialShow }: { initialShow: boolean }) {
  const t = useTranslations("Consent");
  const [show, setShow] = useState(initialShow);

  useEffect(() => {
    const open = () => setShow(true);
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  if (!show) return null;

  const choose = (choice: ConsentChoice) => {
    writeConsent(choice);
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label={t("label")}
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border-subtle bg-surface"
    >
      <div
        className={`${CONTAINER} flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between`}
      >
        <p className="text-[14px] leading-relaxed text-ink-2">
          {t("message")}{" "}
          <Link
            href="/cookies"
            className="text-accent underline underline-offset-4 hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("learnMore")}
          </Link>
        </p>
        <div className="flex shrink-0 gap-3">
          <button
            type="button"
            onClick={() => choose("denied")}
            className={`${buttonClasses("secondary")} min-h-11`}
          >
            {t("decline")}
          </button>
          <button
            type="button"
            onClick={() => choose("granted")}
            className={`${buttonClasses("primary")} min-h-11`}
          >
            {t("accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
