"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { SlaStepper } from "@/components/sla/SlaStepper";
import type { SlaContent } from "@/server/repositories/sla";

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
 * - The SLA renders the SAME `SlaStepper` the rail card mounts, from the content
 *   model (Story 3.5). It used to borrow the `Industry.sla` one-liner, because
 *   the 2.6 review had found four uncentralised copies and this surface refused
 *   to mint a fifth; that key is now deleted and the sharing is structural.
 *   `tone="light"` because this card is `bg-surface` — the rail's `onDark` tone
 *   would put a 2.96:1 fallback marker on white.
 * - Focus moves to the heading (`tabIndex={-1}` + effect): the submit button it
 *   replaced is gone from the DOM, and without this the focus falls to <body>
 *   and the swap is silent to a screen reader. `focus()` scrolls instantly —
 *   reduced-motion-safe by default; never add `scrollIntoView({smooth})` here.
 */
export function RfqConfirmation({
  reference,
  sla,
}: {
  reference: string;
  /** Threaded from `rfq/page.tsx` through `RfqForm`: this is a client component
   *  mounted from a client parent, so it cannot read anything itself. */
  sla: SlaContent | null;
}) {
  const t = useTranslations("Rfq");
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
      {sla && (
        <div className="mt-6">
          <SlaStepper sla={sla} tone="light" />
        </div>
      )}
    </section>
  );
}
