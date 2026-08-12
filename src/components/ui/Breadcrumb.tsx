import { Fragment } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CONTAINER } from "@/components/layout/container";

export interface Crumb {
  label: string;
  /** Omitted on the current page, which is rendered as text, not a link. */
  href?: string;
  /** Marks the label as EN fallback content so screen readers announce the switch. */
  isFallback?: boolean;
}

/**
 * Breadcrumb (Story 2.1) — DESIGN.md § Components: `surface-2` strip, bottom
 * hairline, `padding [14,100]`, mono 12, separators in `border-subtle`.
 *
 * ONE DELIBERATE DEVIATION FROM DESIGN.md. The spec sets the trail in `muted`,
 * which measures 2.89:1 on `surface-2` — a WCAG AA failure for normal-size text,
 * and mono 12 is normal size. EXPERIENCE.md § Accessibility Floor anticipates
 * exactly this case and directs that small `muted` labels carrying meaning
 * "darken toward `ink-2`", marked [VERIFY at build] — this is that verification.
 * `ink-2` measures 5.60:1 on `surface-2`. The current-page label stays `ink` as
 * specified. Story 1.5's review recorded the same conflict for the same reason.
 *
 * The separator is `aria-hidden`: it is decoration between list items, and letting
 * a screen reader read "slash" between every crumb adds noise, not structure. The
 * `<ol>` already conveys the ordering.
 */
export function Breadcrumb({ items }: { items: readonly Crumb[] }) {
  const t = useTranslations("Nav");
  if (items.length === 0) return null;

  return (
    <nav aria-label={t("breadcrumb")} className="border-b border-border-subtle bg-surface-2">
      <ol className={`${CONTAINER} flex flex-wrap items-center gap-2 py-3.5 font-mono text-xs`}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              <li>
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    lang={item.isFallback ? "en" : undefined}
                    className="text-ink-2 hover:text-ink hover:underline underline-offset-4"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    lang={item.isFallback ? "en" : undefined}
                    className={isLast ? "text-ink" : "text-ink-2"}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden className="text-border-subtle">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
