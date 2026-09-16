import {
  LayoutDashboard,
  Inbox,
  Package,
  FolderOpen,
  Image,
  FileText,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * The admin sidebar's module list (Story 4.2). Styled after the recovered canvas
 * ("Admin — Inquiries", `glh-canvas-outline.md:397+`) but keyed to the ACTUAL
 * Epic 4 stories — the canvas nav predates the final split, so this is the
 * reconciled set.
 *
 * ⚠️ `available` gates whether an item is a live link. Only the Dashboard exists
 * in 4.2; the rest render disabled ("soon") so the workspace looks whole. Each
 * later module story flips its OWN item to `available: true` when it ships —
 * that is the single edit those stories make here.
 *
 * Export / import (4.9 / 4.10) are Settings-area actions, not top-level nav.
 * `path` is the suffix under `/[locale]/admin`; "" is the dashboard itself.
 */
export interface AdminNavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  path: string;
  story: string;
  available: boolean;
}

export const ADMIN_NAV: AdminNavItem[] = [
  {
    key: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    path: "",
    story: "4.2",
    available: true,
  },
  {
    key: "inquiries",
    label: "Inquiries",
    icon: Inbox,
    path: "/inquiries",
    story: "4.7",
    available: false,
  },
  {
    key: "catalog",
    label: "Catalog",
    icon: Package,
    path: "/catalog",
    story: "4.3",
    available: true,
  },
  {
    key: "content",
    label: "Content",
    icon: FolderOpen,
    path: "/content",
    story: "4.4",
    available: false,
  },
  { key: "media", label: "Media", icon: Image, path: "/media", story: "4.5", available: false },
  {
    key: "documents",
    label: "Documents",
    icon: FileText,
    path: "/documents",
    story: "4.6",
    available: false,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    path: "/settings",
    story: "4.8",
    available: false,
  },
];

/**
 * Is `navPath` (a locale-stripped pathname like `/admin` or `/admin/catalog`) the
 * active item for `item`? Dashboard matches only the exact `/admin`; others match
 * their subtree so a future `/admin/catalog/new` still highlights Catalog.
 */
export function isNavItemActive(item: AdminNavItem, navPath: string): boolean {
  const base = `/admin${item.path}`;
  return item.path === ""
    ? navPath === "/admin"
    : navPath === base || navPath.startsWith(`${base}/`);
}
