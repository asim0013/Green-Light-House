import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import tr from "../../../messages/tr.json";
import ru from "../../../messages/ru.json";
import { routing } from "@/i18n/routing";
import {
  assertHeaderSafe,
  isEmailConfigured,
  resolveNotifyRecipient,
  type EmailTransport,
} from "@/lib/email";
import {
  deliveryFailure,
  findLeadForEmail,
  markDeliverySent,
  recordDeliveryFailure,
  type DeliveryKind,
  type LeadForEmail,
} from "@/server/repositories/lead";

/**
 * The `rfq.submitted` send flow (Story 3.3 — FR29).
 *
 * THIS IS THE JOB, EXTRACTED FROM THE WORKER. `worker/index.ts` is thin wiring
 * around it so the flow can be exercised by unit tests with fakes AND by the
 * integration suite through a real BullMQ Worker — the same code both times.
 * A processor written inline in the worker entry would be reachable only by
 * standing up the whole runtime, which is how send logic ends up untested.
 *
 * TWO SENDS, ONE JOB, INDEPENDENT SHORT-CIRCUITS (Task 0 #6). The ordering per
 * email is: provider accepts → stamp the lead column → (both done) → the job
 * completes. A retry consults the STAMPS, not a flag on the job, so a retry
 * after "notification sent, confirmation failed" attempts only the
 * confirmation. That is what makes "exactly one confirmation" true for every
 * failure the system can actually observe.
 *
 * ⚠️ THE RESIDUAL, DISCLOSED RATHER THAN CLAIMED AWAY: a crash between the
 * provider accepting and the stamp landing re-sends that ONE email on the next
 * attempt. This is at-least-once by construction — closing it would need a
 * distributed transaction with the provider, which does not exist. The
 * `Idempotency-Key` (reference + kind) narrows the window provider-side.
 */

/** What the flow reports back, so the worker and the tests can assert it. */
export interface NotifyOutcome {
  /** `skipped` = the lead is gone; nothing to do and nothing to retry. */
  status: "sent" | "partial" | "skipped";
  notify: "sent" | "already" | "failed" | "unconfigured";
  confirm: "sent" | "already" | "failed";
  /** True when the job should THROW so BullMQ retries it. */
  retry: boolean;
}

export interface NotifyDeps {
  transport: EmailTransport;
  /** Injected so tests need neither Prisma nor a clock. */
  findLead?: typeof findLeadForEmail;
  markSent?: typeof markDeliverySent;
  recordFailure?: typeof recordDeliveryFailure;
  now?: () => Date;
  /** True on the final attempt: only then is a failure TERMINAL and recorded
   *  (a reason column that flickered mid-retry would mislead Story 4.7). */
  isFinalAttempt?: boolean;
}

/**
 * All three catalogues, STATICALLY imported.
 *
 * Not `require(locale)`: dynamic requires are lint-forbidden here, and — more
 * importantly — a computed path defeats bundling, so the worker image would
 * need the `messages/` directory shipped alongside it and would fail at
 * RUN time rather than build time if it were missing. Three small JSON files
 * held in memory is the cheaper trade.
 */
const CATALOGUES: Record<string, unknown> = { en, tr, ru };

/**
 * The translator, typed as a plain key→string function.
 *
 * next-intl augments its own types from the app's message shape, which makes
 * every namespace key resolve to `never` outside a request scope. The cast is
 * the honest bridge: this is the non-React `createTranslator` running in a
 * worker with no request context, and the keys it uses are pinned by the
 * parity gate plus this module's own tests rather than by the compiler.
 */
type Translate = (key: string, values?: Record<string, unknown>) => string;

/** The reply language, defaulting to EN when the lead never stated one. */
export function localeFor(lead: Pick<LeadForEmail, "locale">): string {
  const locale = lead.locale ?? routing.defaultLocale;
  return (routing.locales as readonly string[]).includes(locale) ? locale : routing.defaultLocale;
}

/** The call is cast as a whole: casting only `messages` collapses `namespace`
 *  to `undefined` in the overload next-intl resolves, which is a type artefact
 *  rather than a real constraint. */
type CreateTranslator = (options: {
  locale: string;
  messages: unknown;
  namespace: string;
}) => Translate;

function translator(locale: string): Translate {
  return (createTranslator as unknown as CreateTranslator)({
    locale,
    messages: CATALOGUES[locale],
    namespace: "RfqEmail",
  });
}

/** Kilobytes, rounded up — the notification says "how big", not "how many bytes". */
function kilobytes(bytes: number | null): number {
  return Math.max(1, Math.ceil((bytes ?? 0) / 1024));
}

/**
 * The attachment line, per the THREE reachable terminal states (Task 0 #3).
 *
 * `pending` is unreachable — the scan is synchronous (Story 3.7b) — and an
 * infected submission is rejected before a row exists, so neither has copy.
 * `failed` means the scan passed but STORAGE lost the file: the metadata
 * survives on the row while the object does not, so the line must not imply we
 * are holding something.
 *
 * NEVER ATTACHES AND NEVER LINKS, even when clean: no serving route exists
 * until Story 4.7 (one shipped now would be unauthenticated), and an emailed
 * copy escapes the quarantine state machine permanently — a file clean in
 * August can be infected in September.
 */
export function attachmentLine(
  lead: Pick<LeadForEmail, "attachmentName" | "attachmentSizeBytes" | "attachmentScanStatus">,
  t: Translate,
): string | null {
  if (!lead.attachmentName || lead.attachmentScanStatus === null) return null;
  if (lead.attachmentScanStatus === "clean") {
    return t("attachmentClean", {
      name: lead.attachmentName,
      size: kilobytes(lead.attachmentSizeBytes),
    });
  }
  return t("attachmentFailed", { name: lead.attachmentName });
}

/** The internal notification — EN by design (Task 0 #13). */
export function buildNotification(lead: LeadForEmail): { subject: string; text: string } {
  const t = translator(routing.defaultLocale);
  const none = t("notifyNone");
  const value = (v: string | null | undefined) => (v && v.trim() !== "" ? v : none);

  const equipment = Array.isArray(lead.equipment)
    ? (lead.equipment as { kind: string; text?: string; label?: string }[])
        .map((item) => item.text ?? item.label ?? "")
        .filter(Boolean)
        .join(", ")
    : "";

  const lines = [
    t("notifyIntro"),
    "",
    t("notifyReference", { reference: lead.reference }),
    t("notifySender", { name: lead.name, company: lead.company, email: lead.email }),
    "",
    `${t("notifySectionProject")}:`,
    `  industry: ${value(lead.industry)}`,
    `  timeline: ${value(lead.timeline)}`,
    `  equipment: ${value(equipment)}`,
    `  quantities: ${value(lead.quantities)}`,
    `  details: ${value(lead.projectDetails)}`,
    "",
    `${t("notifySectionSender")}:`,
    `  phone: ${value(lead.phone)}`,
    `  country: ${value(lead.country)}`,
    `  reply language: ${value(lead.locale)}`,
  ];

  const attachment = attachmentLine(lead, t);
  if (attachment) lines.push("", `${t("notifySectionAttachment")}:`, `  ${attachment}`);

  return {
    // ⚠️ The subject is built from the REFERENCE ALONE. Buyer-supplied strings
    // live in the body, where a newline is inert; in a header it would split
    // the header block. `assertHeaderSafe` is the structural backstop.
    subject: assertHeaderSafe(t("notifySubject", { reference: lead.reference }), "subject"),
    text: lines.join("\n"),
  };
}

/** The sender confirmation — localized, and carrying NO durations (Task 0 #1). */
export function buildConfirmation(lead: LeadForEmail): { subject: string; text: string } {
  const t = translator(localeFor(lead));
  const text = [
    t("confirmGreeting", { name: lead.name }),
    "",
    t("confirmBody"),
    t("confirmReference", { reference: lead.reference }),
    "",
    t("confirmSignoff"),
  ].join("\n");
  return {
    subject: assertHeaderSafe(t("confirmSubject", { reference: lead.reference }), "subject"),
    text,
  };
}

/** `GLH-RFQ-2042:notify` — stable per lead per email kind. */
function idempotencyKey(lead: LeadForEmail, kind: DeliveryKind): string {
  return `${lead.reference}:${kind}`;
}

/**
 * Process one `rfq.submitted` job.
 *
 * Returns rather than throwing for every outcome the system understands; the
 * WORKER turns `retry: true` into a throw, because throwing is BullMQ's only
 * retry signal. Keeping that translation at the edge means this function stays
 * testable without a queue.
 */
export async function processRfqSubmitted(
  leadId: string,
  deps: NotifyDeps,
): Promise<NotifyOutcome> {
  const findLead = deps.findLead ?? findLeadForEmail;
  const markSent = deps.markSent ?? markDeliverySent;
  const recordFailure = deps.recordFailure ?? recordDeliveryFailure;
  const now = deps.now ?? (() => new Date());
  const isFinal = deps.isFinalAttempt ?? false;

  const lead = await findLead(leadId);
  if (!lead) {
    // A job for a deleted lead must COMPLETE, never retry: the row is not
    // coming back, and five exponential attempts would just delay the
    // inevitable while looking like a transient fault in the dashboard.
    console.warn(`[worker] lead ${leadId} no longer exists — job completed with nothing to send`);
    return { status: "skipped", notify: "already", confirm: "already", retry: false };
  }

  const outcome: NotifyOutcome = {
    status: "sent",
    notify: "already",
    confirm: "already",
    retry: false,
  };

  // --- The GLH notification -------------------------------------------------
  if (lead.notifiedAt === null) {
    const recipient = resolveNotifyRecipient();
    if (!recipient || !isEmailConfigured(deps.transport)) {
      // A missing recipient or API key will still be missing on the next
      // attempt, so this is recorded IMMEDIATELY and never retried — unlike a
      // provider failure, waiting changes nothing.
      console.error(
        "[worker] RFQ_NOTIFY_TO or the transport is unconfigured — notification skipped",
      );
      await recordFailure(lead.id, deliveryFailure("notify", "unconfigured"));
      outcome.notify = "unconfigured";
      outcome.status = "partial";
    } else {
      const message = buildNotification(lead);
      const result = await deps.transport.send({
        to: recipient,
        subject: message.subject,
        text: message.text,
        idempotencyKey: idempotencyKey(lead, "notify"),
      });
      if (result.ok) {
        await markSent(lead.id, "notify", now());
        outcome.notify = "sent";
      } else {
        outcome.notify = "failed";
        outcome.status = "partial";
        outcome.retry = true;
        if (isFinal) await recordFailure(lead.id, deliveryFailure("notify", result.code));
      }
    }
  }

  // --- The sender confirmation ---------------------------------------------
  // Attempted even when the notification failed: they are independent sends,
  // and the buyer's confirmation must not be held hostage to our own inbox.
  if (lead.confirmationSentAt === null) {
    const message = buildConfirmation(lead);
    const result = await deps.transport.send({
      to: lead.email,
      subject: message.subject,
      text: message.text,
      idempotencyKey: idempotencyKey(lead, "confirm"),
    });
    if (result.ok) {
      await markSent(lead.id, "confirm", now());
      outcome.confirm = "sent";
    } else {
      outcome.confirm = "failed";
      outcome.status = "partial";
      outcome.retry = true;
      if (isFinal) await recordFailure(lead.id, deliveryFailure("confirm", result.code));
    }
  }

  return outcome;
}
