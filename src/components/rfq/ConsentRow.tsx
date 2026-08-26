"use client";

import type { ChangeHandler } from "react-hook-form";
import { Check } from "lucide-react";
import { forwardRef } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

/**
 * The consent row (Story 3.2, AC5/AC6 — FR44's UI half).
 *
 * Anatomy, each part deliberate:
 *
 * - The `<label>` wraps the 18×18 sharp box AND the FULL consent sentence, so
 *   the whole row is the ≥44px hit area (`min-h-11`).
 * - The Privacy Policy LINK sits OUTSIDE the `<label>`, on its own line below —
 *   a link inside the label makes mis-clicks near it toggle-adjacent, and its
 *   text would pollute the checkbox's accessible name. The link's text reuses
 *   `Footer.privacy` EXACTLY, so the checkbox sentence, this link and the
 *   footer all name the same document in each locale.
 * - The sentence itself is the canvas string VERBATIM (its second sentence is a
 *   PROMISE EXPERIENCE.md:59 requires, not boilerplate). It names the policy in
 *   plain words; the link below is where the name resolves.
 * - The checkbox participates in error wiring like any field: `aria-invalid`,
 *   `aria-describedby` → the error element here, and it is a stop on
 *   focus-to-first-invalid. The consent-blocked message must be announced like
 *   any field error (EXPERIENCE.md:85).
 *
 * The visual box: `appearance-none` + peer-checked overlay, because a native
 * checkbox cannot be made sharp-cornered cross-platform and DESIGN.md's radius
 * override does not reach UA-rendered widgets.
 */
export const ConsentRow = forwardRef<
  HTMLInputElement,
  {
    error?: string;
    name: string;
    onChange: ChangeHandler;
    onBlur: ChangeHandler;
  }
>(function ConsentRow({ error, ...register }, ref) {
  const t = useTranslations("Rfq");
  const tFooter = useTranslations("Footer");

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor="rfq-consent"
        className="flex min-h-11 cursor-pointer items-start gap-2.5 text-[14px] leading-relaxed text-ink-2"
      >
        <span className="relative mt-0.5 inline-flex shrink-0">
          <input
            id="rfq-consent"
            type="checkbox"
            ref={ref}
            {...register}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "rfq-consent-error" : undefined}
            className={`peer size-[18px] appearance-none border bg-surface checked:border-accent checked:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent ${
              error ? "border-error" : "border-muted"
            }`}
          />
          <Check
            size={14}
            aria-hidden
            className="pointer-events-none absolute left-[2px] top-[2px] hidden text-white peer-checked:block"
          />
        </span>
        <span>{t("consent")}</span>
      </label>
      {/* Outside the label, indented under the sentence — see the anatomy note. */}
      <Link
        href="/privacy"
        className="ml-[calc(18px+0.625rem)] inline-flex min-h-11 w-fit items-center text-[13px] text-accent underline underline-offset-4 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      >
        {tFooter("privacy")}
      </Link>
      {error && (
        <p id="rfq-consent-error" className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
});
