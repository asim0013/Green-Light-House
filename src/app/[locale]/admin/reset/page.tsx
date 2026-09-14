import { buttonClasses } from "@/components/ui/buttonClasses";

/**
 * Consume a password reset (Story 4.1 — FR39a). The token + email come from the
 * emailed link's query string and ride as hidden fields to `/api/admin/reset`.
 * The route enforces the same 12-char minimum this form asks for. Generic error
 * flag only — never says whether the email, token or expiry failed.
 */
const INPUT =
  "w-full border border-border-subtle bg-surface px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
const MIN_PASSWORD = 12;

export default async function AdminResetPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string; email?: string; error?: string }>;
}) {
  const { locale } = await props.params;
  const sp = await props.searchParams;
  const hasLink = Boolean(sp.token && sp.email);

  return (
    <div className="border border-border-subtle bg-surface p-6">
      <h1 className="mb-2 font-heading text-[18px] font-bold tracking-tight text-ink">
        Choose a new password
      </h1>
      {sp.error && (
        <p className="mb-4 text-[13px] text-ink-2" role="status">
          That reset link is invalid or has expired. Request a new one.
        </p>
      )}
      {hasLink ? (
        <form method="post" action="/api/admin/reset" className="flex flex-col gap-3">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="token" value={sp.token} />
          <input type="hidden" name="email" value={sp.email} />
          <label className="flex flex-col gap-1 text-[13px] text-ink-2">
            New password (min {MIN_PASSWORD} characters)
            <input
              className={INPUT}
              type="password"
              name="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              required
            />
          </label>
          <button type="submit" className={buttonClasses("primary", "mt-2 min-h-11 w-full")}>
            Set new password
          </button>
        </form>
      ) : (
        <p className="text-[13px] text-ink-2">Open the reset link from your email to continue.</p>
      )}
      <a
        href={`/${locale}/admin/forgot`}
        className="mt-4 inline-block text-[13px] text-accent hover:underline underline-offset-4"
      >
        Request a new link
      </a>
    </div>
  );
}
