"use client";

import { Link, usePathname } from "@/i18n/navigation";
import { ADMIN_NAV, isNavItemActive } from "./nav";

/**
 * The admin sidebar (Story 4.2) — 244px dark rail, matching the canvas
 * (`glh-canvas-outline.md:397-441`). Client component: `usePathname` drives the
 * active state. It receives the admin email as a PROP from the server `(authed)`
 * layout — it never imports the repository/Prisma itself (boundary rule).
 *
 * The dark shades (`#1E2A3A` active, `#9AA6B4`/`#C2CAD4` idle, `#26313F` divider,
 * `#7C8896` muted) are the canvas's fixed sidebar palette — arbitrary values on
 * purpose; the sidebar is a fixed dark surface, not theme-reactive.
 */
export function AdminSidebar({ adminEmail, locale }: { adminEmail: string; locale: string }) {
  const pathname = usePathname(); // locale-stripped, e.g. "/admin" or "/admin/catalog"
  const initials = adminEmail.slice(0, 2).toUpperCase();

  return (
    <nav
      aria-label="Admin"
      className="flex w-[244px] shrink-0 flex-col justify-between bg-ink py-6"
    >
      <div className="flex flex-col gap-1.5">
        {/* Brand */}
        <div className="mb-2 flex items-center gap-2.5 px-5 pb-5">
          <span className="flex h-6 w-6 items-center justify-center bg-brand font-heading text-[14px] font-bold text-white">
            G
          </span>
          <span className="flex flex-col">
            <span className="font-heading text-[12px] font-bold tracking-[0.5px] text-white">
              GREENLIGHTHOUSE
            </span>
            <span className="font-mono text-[10px] tracking-[1px] text-[#7C8896]">Admin</span>
          </span>
        </div>

        {/* Module nav */}
        {ADMIN_NAV.map((item) => {
          const Icon = item.icon;
          const active = isNavItemActive(item, pathname);
          const inner = (
            <>
              <Icon size={18} aria-hidden className={active ? "text-white" : "text-[#9AA6B4]"} />
              <span className="text-[14px]">{item.label}</span>
            </>
          );
          if (!item.available) {
            return (
              <span
                key={item.key}
                aria-disabled
                title="Coming soon"
                className="flex cursor-default items-center gap-3 px-5 py-3 font-body text-[14px] text-[#5C6675]"
              >
                {inner}
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-[#5C6675]">
                  soon
                </span>
              </span>
            );
          }
          return (
            <Link
              key={item.key}
              href={`/admin${item.path}`}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "flex items-center gap-3 border-l-[3px] border-accent-soft bg-[#1E2A3A] py-3 pl-[17px] pr-5 font-body font-semibold text-white"
                  : "flex items-center gap-3 px-5 py-3 font-body text-[#C2CAD4] hover:bg-[#1E2A3A]/50"
              }
            >
              {inner}
            </Link>
          );
        })}
      </div>

      {/* User footer + logout */}
      <div className="flex items-center gap-2.5 border-t border-[#26313F] px-5 pt-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center bg-[#2A3646] font-mono text-[12px] text-[#C2CAD4]">
          {initials}
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] text-white">{adminEmail}</span>
          <span className="font-mono text-[10px] text-[#7C8896]">Administrator</span>
        </span>
        <form method="post" action="/api/admin/logout" className="ml-auto">
          <input type="hidden" name="locale" value={locale} />
          <button
            type="submit"
            className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#9AA6B4] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
