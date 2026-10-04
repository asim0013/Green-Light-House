"use client";

import { useEffect, useRef, useState } from "react";
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
 *
 * ⚠️ MOBILE OVERLAP (review 5.2 #5): this bar is `fixed bottom-0 z-50` and the
 * `MobileCtaBar` is `sticky bottom-0 z-40` — so while the bar is open it publishes
 * its measured height as `--glh-consent-h` on `:root`, and the CTA bar lifts itself
 * by that amount (`bottom-[var(--glh-consent-h,0px)]`). Both stay fully usable; the
 * var is `0px` whenever the bar is closed, so the CTA sits flush as before.
 */
export function ConsentBanner({ initialShow }: { initialShow: boolean }) {
  const t = useTranslations("Consent");
  const [show, setShow] = useState(initialShow);
  const ref = useRef<HTMLDivElement>(null);
  // What to refocus on close — set only when the bar is RE-OPENED via the footer
  // control, so a keyboard user returns to that control (WCAG 2.4.3, review 5.2 #10).
  // null on first-visit auto-show (nothing was focused to restore).
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const open = () => {
      returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
      setShow(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  // Publish the bar's height so the mobile CTA bar can clear it. `ResizeObserver`
  // is guarded (jsdom lacks it); re-measures on locale/viewport reflow.
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.setProperty("--glh-consent-h", "0px");
    if (!show) {
      clear();
      return;
    }
    const el = ref.current;
    if (!el) return;
    const measure = () => root.style.setProperty("--glh-consent-h", `${el.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver === "undefined") return clear;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
      clear();
    };
  }, [show]);

  if (!show) return null;

  const choose = (choice: ConsentChoice) => {
    writeConsent(choice);
    setShow(false);
    const toFocus = returnFocusRef.current;
    returnFocusRef.current = null;
    if (toFocus && typeof toFocus.focus === "function") toFocus.focus();
  };

  return (
    <div
      ref={ref}
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
