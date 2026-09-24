"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { NAV_ITEMS, SITE, type SitePhone } from "@/config/site";
import { isActivePath } from "./isActivePath";
import { CONTAINER } from "./container";
import { BrandMark } from "./BrandMark";

/** The inline nav only fits from 1280px up (RU labels overflow at 1024). */
const DESKTOP_QUERY = "(min-width: 1280px)";

/**
 * Global top nav (Story 1.6). Brand mark + wordmark, industry-led links with an
 * active state, the language switcher, a co-equal `tel:` phone, and the navy
 * Request Project Quote CTA. Collapses to a hamburger below `xl`, keeping the
 * switcher, phone, and CTA reachable. Built from the Story 1.5 tokens/primitives;
 * green is used ONLY for the brand mark.
 *
 * Client component: needs `usePathname` (active state) + menu state.
 * Nav links point at canonical routes that 404 until their stories build them.
 */
export function SiteHeader({ phone = SITE }: { phone?: SitePhone }) {
  const t = useTranslations("Nav");
  const locale = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  };

  // Close on Escape and return focus to the toggle (the panel unmounts its own
  // focused child otherwise, dropping focus to <body>).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // The header lives in the persistent layout, so its state survives soft
  // navigation — close whenever the route changes (covers the brand link, nav
  // links, and browser back/forward). Adjusted during render rather than in an
  // effect: that's React's documented pattern for resetting state on a changed
  // value, and it avoids a frame with the stale menu still open.
  //
  // The key includes the LOCALE because `usePathname()` is locale-stripped: a
  // language switch from inside the menu takes `/en` → `/tr` while the pathname
  // stays "/", so pathname alone would never fire.
  const navKey = `${locale}|${pathname}`;
  const [lastNavKey, setLastNavKey] = useState(navKey);
  if (navKey !== lastNavKey) {
    setLastNavKey(navKey);
    setOpen(false);
  }

  // Reset when the viewport crosses into desktop, so `aria-expanded` never
  // lingers on a hidden toggle and the panel isn't restored on the way back down.
  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const linkClass = (href: string) =>
    isActivePath(pathname, href) ? "font-semibold text-ink" : "text-ink-2 hover:text-ink";

  const phoneLink = (touch = false) => (
    <a
      href={`tel:${phone.phone}`}
      // The visible number is contained in the accessible name (WCAG 2.5.3).
      aria-label={`${t("phoneLabel")}: ${phone.phoneDisplay}`}
      className={`flex items-center gap-1.5 whitespace-nowrap font-data text-sm text-ink hover:text-accent ${
        touch ? "min-h-11 py-2" : ""
      }`}
    >
      <Phone size={15} aria-hidden />
      {phone.phoneDisplay}
    </a>
  );

  return (
    <header className="relative border-b border-border-subtle bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-accent focus:outline focus:outline-2 focus:outline-accent"
      >
        {t("skipToContent")}
      </a>

      <div className={`${CONTAINER} flex items-center justify-between gap-6 py-5`}>
        <Link
          href="/"
          aria-label="GREENLIGHTHOUSE"
          className="flex shrink-0 items-center gap-2.5 whitespace-nowrap"
        >
          <BrandMark />
        </Link>

        {/* Desktop primary nav */}
        <nav aria-label={t("primaryNav")} className="hidden xl:block">
          <ul className="flex items-center gap-7 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                  className={`whitespace-nowrap ${linkClass(item.href)}`}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop right cluster */}
        <div className="hidden shrink-0 items-center gap-5 xl:flex">
          <LanguageSwitcher asLandmark />
          {phoneLink()}
          <Link href={SITE.rfqHref} className={buttonClasses("primary", "whitespace-nowrap")}>
            {t("requestQuote")}
          </Link>
        </div>

        {/* Mobile toggle (44px tap target) */}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? t("close") : t("menu")}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent xl:hidden"
        >
          {open ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}
        </button>
      </div>

      {/*
        Always rendered (hidden when closed) so `aria-controls` is never a dangling
        IDREF — axe `aria-valid-attr-value`.
      */}
      <div id="mobile-menu" hidden={!open} className="border-t border-border-subtle xl:hidden">
        <div className={`${CONTAINER} flex flex-col gap-5 py-5`}>
          {/* Promoted actions: switcher, phone, CTA — all ≥44px targets. */}
          <div className="flex items-center justify-between gap-4">
            {/*
              Also a landmark: the desktop instance is `display:none` below xl, so
              without this there'd be ZERO "Language" landmarks on mobile. The two
              are mutually exclusive by breakpoint, so never two at once.
            */}
            <LanguageSwitcher asLandmark size="lg" />
            {phoneLink(true)}
          </div>
          <Link
            href={SITE.rfqHref}
            onClick={() => close()}
            className={buttonClasses("primary", "w-full")}
          >
            {t("requestQuote")}
          </Link>
          <nav aria-label={t("primaryNav")}>
            <ul className="flex flex-col">
              {NAV_ITEMS.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    onClick={() => close()}
                    aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                    className={`flex min-h-11 items-center py-3 text-base ${linkClass(item.href)}`}
                  >
                    {t(item.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}
