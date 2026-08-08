import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { Kicker } from "@/components/ui";
import { NAV_ITEMS, FOOTER_LEGAL } from "@/config/site";

/**
 * Global footer (Story 1.6). A full-bleed `ink` band (DESIGN "dark bands =
 * authority"; DESIGN has no explicit footer spec, so derived): on-dark tokens,
 * `accent-soft` kickers, `on-dark-border` hairlines, white headings. Shows the
 * brand, İstanbul, explore + legal link columns, the EN/TR/RU switcher, and the
 * copyright. Server component — `useTranslations` reads the request locale set by
 * the layout; the legal routes are built in Story 5.1 (404 until then).
 */
export function SiteFooter() {
  const tNav = useTranslations("Nav");
  const tFooter = useTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <footer className="bg-ink text-on-dark-text">
      <div className="mx-auto max-w-[1440px] px-6 py-14 lg:px-[100px]">
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          {/* Brand block */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden
                className="flex size-[26px] items-center justify-center bg-brand text-[15px] font-bold text-white"
              >
                G
              </span>
              <span className="font-heading text-lg font-bold tracking-tight text-white">
                GREENLIGHTHOUSE
              </span>
            </div>
            <p className="mt-3 text-sm text-on-dark-text">{tFooter("tagline")}</p>
            <p className="mt-4 font-data text-sm text-on-dark-text">{tFooter("city")}</p>
          </div>

          {/* Link columns */}
          <div className="flex flex-col gap-10 sm:flex-row sm:gap-16">
            <nav aria-label={tFooter("explore")}>
              <Kicker>{tFooter("explore")}</Kicker>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {NAV_ITEMS.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="text-on-dark-text hover:text-white">
                      {tNav(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <nav aria-label={tFooter("legal")}>
              <Kicker>{tFooter("legal")}</Kicker>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {FOOTER_LEGAL.map((item) => (
                  <li key={item.key}>
                    <Link href={item.href} className="text-on-dark-text hover:text-white">
                      {tFooter(item.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col gap-4 border-t border-on-dark-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-mono text-xs uppercase tracking-wide text-on-dark-text">
            © {year} GREENLIGHTHOUSE · {tFooter("rights")}
          </p>
          <LanguageSwitcher />
        </div>
      </div>
    </footer>
  );
}
