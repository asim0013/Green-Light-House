"use client";

import { useEffect, useState } from "react";
import { Menu, X, Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { NAV_ITEMS, SITE } from "@/config/site";
import { isActivePath } from "./isActivePath";

/**
 * Global top nav (Story 1.6). Brand mark + wordmark, industry-led links with an
 * active state, the language switcher, a co-equal `tel:` phone, and the navy
 * Request Project Quote CTA. Collapses to a hamburger below `lg`, keeping the
 * switcher, phone, and CTA reachable. Built from the Story 1.5 tokens/primitives;
 * green is used ONLY for the brand mark.
 *
 * Client component: needs `usePathname` (active state) + hamburger state.
 * Nav links point at canonical routes that render the localized 404 until their
 * stories build them (chrome-first).
 */
export function SiteHeader() {
  const t = useTranslations("Nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const linkClass = (href: string) =>
    isActivePath(pathname, href) ? "font-semibold text-ink" : "text-ink-2 hover:text-ink";

  const phone = (
    <a
      href={`tel:${SITE.phone}`}
      aria-label={t("phoneLabel")}
      className="flex items-center gap-1.5 font-data text-sm text-ink hover:text-accent"
    >
      <Phone size={15} aria-hidden />
      {SITE.phoneDisplay}
    </a>
  );

  return (
    <header className="border-b border-border-subtle bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-surface focus:px-4 focus:py-2 focus:font-semibold focus:text-accent focus:outline focus:outline-2 focus:outline-accent"
      >
        {t("skipToContent")}
      </a>

      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-5 lg:px-[100px]">
        {/* Brand — green mark box is the only sanctioned use of green. */}
        <Link href="/" aria-label="GREENLIGHTHOUSE" className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="flex size-[26px] items-center justify-center bg-brand text-[15px] font-bold text-white"
          >
            G
          </span>
          <span className="font-heading text-lg font-bold tracking-tight text-ink">
            GREENLIGHTHOUSE
          </span>
        </Link>

        {/* Desktop primary nav */}
        <nav aria-label={t("primaryNav")} className="hidden lg:block">
          <ul className="flex items-center gap-7 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                  className={linkClass(item.href)}
                >
                  {t(item.key)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Desktop right cluster */}
        <div className="hidden items-center gap-5 lg:flex">
          <LanguageSwitcher />
          {phone}
          <Link href={SITE.rfqHref} className={buttonClasses("primary")}>
            {t("requestQuote")}
          </Link>
        </div>

        {/* Mobile hamburger (>=44px tap target) */}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? t("close") : t("menu")}
          onClick={() => setOpen((v) => !v)}
          className="-mr-2 inline-flex size-11 items-center justify-center text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent lg:hidden"
        >
          {open ? <X size={24} aria-hidden /> : <Menu size={24} aria-hidden />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div id="mobile-menu" className="border-t border-border-subtle lg:hidden">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-6 py-5">
            {/* Promoted actions: switcher, phone, CTA */}
            <div className="flex items-center justify-between gap-4">
              <LanguageSwitcher />
              {phone}
            </div>
            <Link
              href={SITE.rfqHref}
              onClick={() => setOpen(false)}
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
                      onClick={() => setOpen(false)}
                      aria-current={isActivePath(pathname, item.href) ? "page" : undefined}
                      className={`block py-3 text-base ${linkClass(item.href)}`}
                    >
                      {t(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
