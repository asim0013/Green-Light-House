import { buttonClasses } from "@/components/ui/buttonClasses";

/**
 * Request a password reset (Story 4.1 — FR39a). POSTs to `/api/admin/forgot`,
 * which always responds identically (a stranger cannot learn whether the email
 * exists — NFR6). No client JS.
 */
const INPUT =
  "w-full border border-border-subtle bg-surface px-3 py-2 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";

export default async function AdminForgotPage(props: { params: Promise<{ locale: string }> }) {
  const { locale } = await props.params;
  return (
    <div className="border border-border-subtle bg-surface p-6">
      <h1 className="mb-2 font-heading text-[18px] font-bold tracking-tight text-ink">
        Reset password
      </h1>
      <p className="mb-4 text-[13px] text-ink-2">
        Enter your admin email and we&apos;ll send a single-use reset link, valid for one hour.
      </p>
      <form method="post" action="/api/admin/forgot" className="flex flex-col gap-3">
        <input type="hidden" name="locale" value={locale} />
        <label className="flex flex-col gap-1 text-[13px] text-ink-2">
          Email
          <input className={INPUT} type="email" name="email" autoComplete="username" required />
        </label>
        <button type="submit" className={buttonClasses("primary", "mt-2 min-h-11 w-full")}>
          Send reset link
        </button>
      </form>
      <a
        href={`/${locale}/admin/login`}
        className="mt-4 inline-block text-[13px] text-accent hover:underline underline-offset-4"
      >
        Back to sign in
      </a>
    </div>
  );
}
