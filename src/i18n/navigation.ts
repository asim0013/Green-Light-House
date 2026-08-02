import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

/**
 * Locale-aware navigation surface (Story 1.4). Components MUST import `Link`,
 * `useRouter`, `usePathname`, etc. from here — never from `next/link` /
 * `next/navigation` — so locale prefixing and the `NEXT_LOCALE` cookie are
 * handled correctly. `usePathname()` returns the current path WITHOUT the locale
 * prefix (dynamic segments already resolved), so re-navigating with a new
 * `locale` preserves the exact route.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
