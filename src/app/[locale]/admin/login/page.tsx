import { buttonClasses } from "@/components/ui/buttonClasses";

/**
 * Admin login (Story 4.1 — FR39). A plain server-rendered form that POSTs to
 * `/api/admin/login`; the handler sets the session cookie and 303s on success.
 * No client JS. The flag messages are GENERIC — never say which field was wrong,
 * nor whether an account exists (NFR6).
 */
const INPUT =
  "w-full border border-border-subtle bg-surface px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export default async function AdminLoginPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    error?: string;
    retry?: string;
    sent?: string;
    reset?: string;
    next?: string;
  }>;
}) {
  const { locale } = await props.params;
  const sp = await props.searchParams;

  const message =
    sp.error === "throttled"
      ? `Too many attempts. Try again${sp.retry ? ` in about ${Math.ceil(Number(sp.retry) / 60)} minute(s)` : " later"}.`
      : sp.error
        ? "Invalid email or password."
        : sp.sent
          ? "If that email is registered, a reset link has been sent."
          : sp.reset
            ? "Password updated. Sign in with your new password."
            : null;

  return (
    <div className="border border-border-subtle bg-surface p-6">
      <h1 className="mb-4 font-heading text-[18px] font-bold tracking-tight text-ink">Sign in</h1>
      {message && (
        <p className="mb-4 text-[13px] text-ink-2" role="status">
          {message}
        </p>
      )}
      <form method="post" action="/api/admin/login" className="flex flex-col gap-3">
        <input type="hidden" name="locale" value={locale} />
        {sp.next && <input type="hidden" name="next" value={sp.next} />}
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Email
          <input className={INPUT} type="email" name="email" autoComplete="username" required />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Password
          <input
            className={INPUT}
            type="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </label>
        <button type="submit" className={buttonClasses("primary", "mt-2 min-h-11 w-full")}>
          Sign in
        </button>
      </form>
      <a
        href={`/${locale}/admin/forgot`}
        className="mt-4 inline-block text-[13px] text-accent hover:underline underline-offset-4"
      >
        Forgot your password?
      </a>
    </div>
  );
}
