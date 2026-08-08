/**
 * Active-nav logic (Story 1.6). `pathname` is the locale-stripped path from
 * next-intl `usePathname()` (e.g. "/", "/industries", "/industries/oil-gas").
 * A nav item is active when the path equals its href or is nested under it; the
 * home item ("/") is active only on an exact "/". The trailing-slash check keeps
 * "/industries-foo" from activating "/industries".
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
