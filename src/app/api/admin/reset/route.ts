import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { consumeReset } from "@/lib/auth/reset";
import { routing } from "@/i18n/routing";

/**
 * Consume a password reset (Story 4.1 — FR39a). Verifies (email, token) against
 * the stored single-use hash + expiry and sets the new password.
 *
 * ⚠️ GENERIC on failure — a bad/expired/reused token and an unknown email all
 * 303 back to the reset page with one flag; the success path 303s to login with
 * `?reset=1`. A minimum password length is enforced here (defence; the form also
 * checks) so a reset cannot install a trivially weak secret.
 */
const MIN_PASSWORD = 12;

function localeOf(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return (routing.locales as readonly string[]).includes(s) ? s : routing.defaultLocale;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const locale = localeOf(form.get("locale"));
  const email = String(form.get("email") ?? "").trim();
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");

  const backToReset = () => {
    const url = new URL(`/${locale}/admin/reset`, siteOrigin());
    url.searchParams.set("error", "1");
    if (email) url.searchParams.set("email", email);
    if (token) url.searchParams.set("token", token);
    return NextResponse.redirect(url, { status: 303 });
  };

  if (password.length < MIN_PASSWORD) return backToReset();

  const ok = await consumeReset(email, token, password);
  if (!ok) return backToReset();

  const url = new URL(`/${locale}/admin/login`, siteOrigin());
  url.searchParams.set("reset", "1");
  return NextResponse.redirect(url, { status: 303 });
}
