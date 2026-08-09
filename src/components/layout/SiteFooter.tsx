import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { DarkBand, Kicker } from "@/components/ui";
import { NAV_ITEMS, FOOTER_LEGAL } from "@/config/site";
import { CONTAINER } from "./container";
import { BrandMark } from "./BrandMark";

/**
 * Global footer (Story 1.6). Uses the `DarkBand` primitive for the `ink` surface
 * (DESIGN "dark bands = authority"; DESIGN has no explicit footer spec, so
 * derived): on-dark tokens throughout — `accent-soft` kickers, `on-dark-border`
 * hairlines, white headings, and the switcher in its `onDark` tone (a navy
 * switcher on ink measures 1.32:1, which is why the tone prop exists).
 *
 * Server component — `useTranslations` reads the request locale set by the layout.
 * Legal routes are built in Story 5.1 (404 until then).
 */
export function SiteFooter() {
  const tNav = useTranslations("Nav");
  const tFooter = useTranslations("Footer");
  const year = new Date().getFullYear();

  return (
    <DarkBand as="footer">
      <div className={`${CONTAINER} py-14`}>
        <div className="flex flex-col gap-10 md:flex-row md:justify-between">
          {/* Brand block */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <BrandMark tone="onDark" />
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
          {/*
            `lg` sizing: the footer switcher is not breakpoint-gated, so on a phone
            it is the only language control reachable without opening the hamburger
            — it must meet the ≥44px touch floor.
          */}
          <LanguageSwitcher tone="onDark" size="lg" />
        </div>
      </div>
    </DarkBand>
  );
}
