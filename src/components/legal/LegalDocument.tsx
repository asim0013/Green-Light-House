import type { ReactNode } from "react";
import { CONTAINER } from "@/components/layout/container";

/**
 * The shared shell for the three legal pages (Story 5.1 — `/privacy`, `/terms`,
 * `/cookies`). One place owns the a11y shape — a single `<h1>`, a readable
 * `72ch` measure, the optional version/effective line — so the three routes
 * cannot drift in markup. Each `page.tsx` stays thin: it owns only its locale
 * guard, its `force-dynamic`, its `generateMetadata` (robots via `legalSignals`,
 * one predicate per surface) and its own `Legal.*` namespace, and passes the
 * resolved strings in as `children`.
 *
 * Derived from the `/privacy` stub's layout (Story 3.2): `${CONTAINER}
 * max-w-[72ch] py-10 md:py-14`, heading in `font-heading`, body paragraphs in
 * `text-ink-2`.
 */
export function LegalDocument({
  title,
  versionLine,
  children,
}: {
  title: string;
  /** The policy version (privacy) or effective-period (terms/cookies) line. */
  versionLine?: string;
  /** The document body — a stack of `<p>` paragraphs supplied by the page. */
  children: ReactNode;
}) {
  return (
    <div className={`${CONTAINER} max-w-[72ch] py-10 md:py-14`}>
      <h1 className="font-heading text-[28px] font-bold leading-tight tracking-tight text-ink md:text-[34px]">
        {title}
      </h1>
      {versionLine ? (
        <p
          className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2"
          translate="no"
        >
          {versionLine}
        </p>
      ) : null}
      <div className="mt-6 flex flex-col gap-4 text-[15px] leading-relaxed text-ink-2">
        {children}
      </div>
    </div>
  );
}
