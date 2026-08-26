import type { AttachmentScanStatus } from "@prisma/client";

/**
 * The Story 4.7 handoff (Story 3.7b — Task 0 #10).
 *
 * A DISCRIMINATED UNION, NOT A BOOLEAN HELPER, and the reason is this project's
 * signature failure mode: a helper can simply not be called. `canDownload(lead)`
 * placed one `if` between an infected file and a link an admin clicks, and
 * nothing in the type system would notice its absence. Here, `href` exists ONLY
 * on the `clean` branch — so rendering a link for a pending, infected or failed
 * attachment is a COMPILE ERROR, not a review finding. This follows
 * `LeadCreateData`'s Pick-narrowing precedent (`server/repositories/lead.ts`):
 * make the wrong thing unwriteable rather than merely discouraged.
 *
 * `attachmentKey` APPEARS ON NO BRANCH. The storage key is server-side state,
 * exactly as `ProjectMediaEntry.storageKey` never reaches the browser — and it
 * is what makes a future access rule enforceable at all.
 *
 * ⚠️ NOTHING SERVES `href` YET, AND THAT IS DELIBERATE. Story 3.7b ships no
 * serving route: `src/app/[locale]/admin` is empty and authentication is Story
 * 4.1's, so any download route added here would be UNAUTHENTICATED — an
 * anonymous read path to files we have just finished quarantining. 4.7 builds
 * the route (behind 4.1's auth) at the URL this function names.
 */

/** The `Lead` columns this view derives from. A structural type, so a `select`
 *  that fetches exactly these satisfies it without importing the model. */
export interface LeadAttachmentSource {
  id: string;
  createdAt: Date;
  attachmentKey: string | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSizeBytes: number | null;
  attachmentScanStatus: AttachmentScanStatus | null;
  attachmentScannedAt: Date | null;
}

/** What every present-attachment branch carries. Never the storage key. */
interface AttachmentFacts {
  /** The buyer's original filename, as sent. Display-only — it is
   *  attacker-controlled text and is NOT part of the storage key. */
  name: string;
  mime: string | null;
  sizeBytes: number | null;
  scannedAt: Date | null;
}

export type LeadAttachmentView =
  | { state: "none" }
  | ({ state: "pending" } & AttachmentFacts)
  | ({ state: "infected" } & AttachmentFacts)
  | ({ state: "failed" } & AttachmentFacts)
  | ({ state: "clean"; href: string } & AttachmentFacts);

/**
 * How long a `pending` attachment may stay pending before it is treated as
 * failed (AC11).
 *
 * Under Story 3.7b's design `pending` is UNREACHABLE: the scan is synchronous,
 * so every row is written with a terminal state in the same insert. This
 * threshold exists because "unreachable today" is not "unreachable forever" —
 * Story 3.3 introduces a worker, and the moment anything writes `pending`
 * asynchronously, a crashed job would otherwise leave a row that says "scan in
 * progress" for the rest of time. A stuck `pending` MEANS the scan never
 * completed, and its end is `failed`: the fail-safe direction, because the one
 * state we must never drift into is showing a download link for a file nothing
 * ever scanned.
 *
 * Fifteen minutes is two orders of magnitude above the measured worst case
 * (502 ms for 15 MB) and above this client's own 20 s deadline.
 */
export const PENDING_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Project one lead's attachment columns into the view Story 4.7 renders.
 *
 * `now` is injected rather than read from the clock so the staleness rule is
 * testable without fake timers — and so a caller rendering a list resolves
 * every row against ONE instant.
 */
export function toLeadAttachmentView(
  lead: LeadAttachmentSource,
  now: Date = new Date(),
): LeadAttachmentView {
  // `attachment_scan_status` is nullable and null means NO ATTACHMENT, never
  // "unscanned" (schema.prisma:65-67). A key with no status would be a broken
  // invariant rather than a rendering case, so it is treated as absent here and
  // the invariant itself is enforced at the write (one insert, both columns).
  if (lead.attachmentScanStatus === null || lead.attachmentName === null) {
    return { state: "none" };
  }

  const facts: AttachmentFacts = {
    name: lead.attachmentName,
    mime: lead.attachmentMime,
    sizeBytes: lead.attachmentSizeBytes,
    scannedAt: lead.attachmentScannedAt,
  };

  if (lead.attachmentScanStatus === "pending") {
    const age = now.getTime() - lead.createdAt.getTime();
    if (age > PENDING_MAX_AGE_MS) {
      // Derived, not stored — the guarantee must not depend on a sweeper having
      // run. `expireStalePendingScans` makes the STORED state agree later.
      return { state: "failed", ...facts };
    }
    return { state: "pending", ...facts };
  }

  if (lead.attachmentScanStatus === "infected") return { state: "infected", ...facts };

  // A clean row with no key is the upload-failed-after-a-clean-scan case: the
  // scan really did pass, but there is nothing to serve, so it is not `clean`.
  if (lead.attachmentScanStatus === "clean" && lead.attachmentKey !== null) {
    return { state: "clean", href: leadAttachmentHref(lead.id), ...facts };
  }

  return { state: "failed", ...facts };
}

/**
 * The URL Story 4.7 must implement, behind Story 4.1's admin auth. Named here
 * so the union and the route cannot disagree about it, and so the ONE place
 * that mints it is the one place the `clean` branch is proven.
 */
export function leadAttachmentHref(leadId: string): string {
  return `/admin/leads/${encodeURIComponent(leadId)}/attachment`;
}
