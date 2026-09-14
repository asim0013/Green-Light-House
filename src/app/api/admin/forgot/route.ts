import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { checkRateLimit, clientKeyFromForwardedFor } from "@/lib/rate-limit";
import { issueReset } from "@/lib/auth/reset";
import { createEmailTransport } from "@/lib/email";
import { routing } from "@/i18n/routing";

/**
 * Request a password reset (Story 4.1 — FR39a). `/api/admin/*` is excluded from
 * the proxy matcher, so this is pre-auth by design.
 *
 * ⚠️ NON-ENUMERATION (NFR6). The response is IDENTICAL whether or not the email
 * belongs to the admin — always a 303 to the login page with `?sent=1`. The
 * email is only sent when `issueReset` returns a token; a stranger cannot tell
 * from timing or status whether an account exists. Rate-limited on the same
 * `login:rl:` keyspace so it cannot be used to hammer the mailer.
 */
function localeOf(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "";
  return (routing.locales as readonly string[]).includes(s) ? s : routing.defaultLocale;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const locale = localeOf(form.get("locale"));
  const email = String(form.get("email") ?? "").trim();

  const rl = await checkRateLimit({
    keyspace: "login:rl:",
    client: clientKeyFromForwardedFor(request.headers.get("x-forwarded-for")),
    limit: 5,
    windowSeconds: 15 * 60,
  });

  if (rl.allowed && email) {
    const token = await issueReset(email); // equal argon2 cost whether or not the email exists
    if (token) {
      const link = `${siteOrigin()}/${locale}/admin/reset?token=${token}&email=${encodeURIComponent(email)}`;
      // ⚠️ NOT AWAITED, so the response time does not include the send — the send
      // only happens for a real account, and awaiting it would leak existence by
      // timing (review finding). Static subject (header-safe); body carries only
      // our own generated link; delivery failure is swallowed (best-effort — the
      // admin can retry or use break-glass).
      void createEmailTransport()
        .send({
          to: email,
          subject: "Reset your GREENLIGHTHOUSE admin password",
          text: `A password reset was requested for the admin account.\n\nReset link (valid for 1 hour, single use):\n${link}\n\nIf you did not request this, ignore this email — nothing changes until the link is used.`,
        })
        .catch(() => {});
    }
  }

  const url = new URL(`/${locale}/admin/login`, siteOrigin());
  url.searchParams.set("sent", "1");
  return NextResponse.redirect(url, { status: 303 });
}
