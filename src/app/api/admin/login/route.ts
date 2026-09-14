import { NextResponse } from "next/server";
import { siteOrigin } from "@/lib/seo";
import { checkRateLimit, clientKeyFromForwardedFor } from "@/lib/rate-limit";
import { verifyCredential } from "@/lib/auth/login";
import { signSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { routing } from "@/i18n/routing";

/**
 * Admin login (Story 4.1 — FR39, NFR6). `/api/admin/*` is EXCLUDED from the
 * proxy matcher, so this handler owns its own guards — the same guard order as
 * `/api/rfq` (Story 3.2/3.7a):
 *
 *   1. Origin check → 403. Canonical-origin equality (never raw strings);
 *      ABSENT is allowed (non-browser clients), PRESENT-and-mismatched rejected.
 *      Mirrors `/api/rfq`'s `originAllowed`; kept inline to avoid refactoring the
 *      RFQ endpoint in an auth story (a future DRY is welcome).
 *   2. Rate limit → 429, BEFORE verifying the credential: reuses
 *      `@/lib/rate-limit` with the reserved `login:rl:` keyspace and the IPv6
 *      /64-bucketed client key. Fails OPEN on a Redis outage.
 *   3. Verify → generic failure. `verifyCredential` is non-enumerable and
 *      constant-ish time; this handler NEVER says which of email/password was
 *      wrong.
 *
 * On success it signs a `jose` session and sets the httpOnly cookie, then 303s
 * to the (validated, same-site) `next` path or the admin root. Failures 303 back
 * to the login page with a generic flag — no enumeration in status or body.
 */
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 15 * 60;

function originAllowed(origin: string | null): boolean {
  if (origin === null) return true; // non-browser clients carry no Origin
  try {
    return new URL(origin).origin === new URL(siteOrigin()).origin;
  } catch {
    return false;
  }
}

/** Only accept a same-site absolute path as the post-login destination — never an open redirect. */
function safeNext(next: string | null, locale: string): string {
  if (next && /^\/[^/\\]/.test(next) && !next.startsWith("//")) return next;
  return `/${locale}/admin`;
}

function localeOf(value: FormDataEntryValue | null): string {
  const v = typeof value === "string" ? value : "";
  return (routing.locales as readonly string[]).includes(v) ? v : routing.defaultLocale;
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!originAllowed(origin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const form = await request.formData();
  const locale = localeOf(form.get("locale"));
  const loginPath = `/${locale}/admin/login`;

  // 2. Rate limit before verifying — a wrong guess costs budget, a locked-out
  //    client never reaches the argon2 verify.
  const rl = await checkRateLimit({
    keyspace: "login:rl:",
    client: clientKeyFromForwardedFor(request.headers.get("x-forwarded-for")),
    limit: LOGIN_LIMIT,
    windowSeconds: LOGIN_WINDOW_SECONDS,
  });
  if (!rl.allowed) {
    const url = new URL(loginPath, siteOrigin());
    url.searchParams.set("error", "throttled");
    if (rl.retryAfterSeconds) url.searchParams.set("retry", String(rl.retryAfterSeconds));
    return NextResponse.redirect(url, { status: 303 });
  }

  const email = String(form.get("email") ?? "");
  const password = String(form.get("password") ?? "");
  const admin = await verifyCredential(email, password);

  if (!admin) {
    const url = new URL(loginPath, siteOrigin());
    url.searchParams.set("error", "invalid"); // generic — never says which field
    return NextResponse.redirect(url, { status: 303 });
  }

  const token = await signSession(admin.id);
  const dest = new URL(
    safeNext(typeof form.get("next") === "string" ? String(form.get("next")) : null, locale),
    siteOrigin(),
  );
  const res = NextResponse.redirect(dest, { status: 303 });
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
