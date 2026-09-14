import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { routing } from "@/i18n/routing";

/** Admin logout (Story 4.1) — clears the session cookie and returns to login. */
export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const raw = form && typeof form.get("locale") === "string" ? String(form.get("locale")) : "";
  const locale = (routing.locales as readonly string[]).includes(raw) ? raw : routing.defaultLocale;
  const res = NextResponse.redirect(new URL(`/${locale}/admin/login`, siteOrigin()), {
    status: 303,
  });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}
