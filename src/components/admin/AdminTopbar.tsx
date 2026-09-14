import type { ReactNode } from "react";

/**
 * The admin main-region topbar (Story 4.2), per the canvas (`:441`). A reusable
 * header every module renders at the top of its page: a title + optional
 * subtitle on the left, optional actions (search, buttons) on the right. The
 * Inquiries-specific search/export/tabs are NOT here — those belong to Story 4.7.
 */
export function AdminTopbar({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border-subtle px-8 py-[22px]">
      <div className="flex flex-col gap-[3px]">
        <h1 className="font-heading text-[24px] font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="font-mono text-[12px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
