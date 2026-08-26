"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

/**
 * The persist-first confirmation (Story 3.2, AC7). Rendered by `RfqForm` as a
 * client-state swap once the POST 2xx lands — the row is already committed, so
 * everything here ECHOES the response, it never re-derives.
 *
 * - The reference is the DB-minted `GLH-RFQ-<digits>` from the response body,
 *   rendered in the data mono inside `translate="no"` (it is a token, and the
 *   RU copy is phrased AROUND it — never transliterated). It is a
 *   quote-over-the-phone handle, NOT a capability: sequential and guessable by
 *   design, so nothing may ever treat knowing it as proof of ownership.
 * - The SLA line reads the SAME `Industry.sla` key the rail card uses — the
 *   2.6 review found four uncentralised copies; this surface does not mint a
 *   fifth (or a 13th, counting locales).
 * - Focus moves to the heading (`tabIndex={-1}` + effect): the submit button it
 *   replaced is gone from the DOM, and without this the focus falls to <body>
 *   and the swap is silent to a screen reader. `focus()` scrolls instantly —
 *   reduced-motion-safe by default; never add `scrollIntoView({smooth})` here.
 */
export function RfqConfirmation({ reference }: { reference: string }) {
  const t = useTranslations("Rfq");
  const tIndustry = useTranslations("Industry");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="border border-border-subtle bg-surface p-5 md:p-6">
      <h2
        ref={headingRef}
        tabIndex={-1}
        // The house ring, not bare outline suppression (3.2 review): after a
        // keyboard-driven submit this focus IS keyboard-mode, and a sighted
        // keyboard user needs to see where focus landed once the form vanished.
        className="font-heading text-2xl font-bold tracking-tight text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
      >
        {t("confirmTitle")}
      </h2>
      <p className="mt-4 text-[15px] leading-relaxed text-ink-2">
        {t.rich("confirmReference", {
          reference,
          ref: (chunks) => (
            <span translate="no" className="font-data font-semibold text-ink">
              {chunks}
            </span>
          ),
        })}
      </p>
      <p className="mt-6 font-mono text-[11px] uppercase leading-relaxed tracking-[0.15em] text-ink-2">
        {tIndustry("sla")}
      </p>
    </section>
  );
}
