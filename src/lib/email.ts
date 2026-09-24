/**
 * The mail transport seam (Story 3.3 — FR29, Task 0 #10/#12).
 *
 * ZERO DEPENDENCIES, DELIBERATELY. Resend's send API is a single HTTPS POST
 * with a bearer token and four JSON fields; wrapping that in an SDK buys
 * nothing and costs a dependency, a version to track and a surface to audit.
 * The same argument retired the ClamAV client's dependency in Story 3.7b, and
 * it holds here for the same reason.
 *
 * PLAIN TEXT ONLY. No HTML, no template engine. Buyer-supplied strings — name,
 * company, project description, filenames — go into these messages, and a text
 * body has no markup for them to escape into. An HTML email would need
 * escaping at every interpolation and would be one forgotten call away from
 * sending attacker markup to Aylin's mail client.
 *
 * ⚠️ HEADER INJECTION IS THE ONE INJECTION A TEXT EMAIL STILL HAS. A newline in
 * a Subject can split the header block and forge headers. So NO BUYER-SUPPLIED
 * STRING EVER REACHES A HEADER: subjects are built from the reference
 * (`GLH-RFQ-<digits>`) alone, and `assertHeaderSafe` refuses anything with a
 * CR/LF/NUL as a last line of defence — a throw here is a bug in the caller,
 * not a runtime condition to absorb.
 *
 * IMPORT-INERT: no env read at module scope, so the DB-free build imports
 * whatever pulls this in without needing mail configuration.
 */

import { prisma } from "@/lib/db";

export type EmailTransportName = "resend" | "memory" | "log";

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. The ONLY body format this project sends. */
  text: string;
  /**
   * Stable per-message identity for provider-side deduplication. Narrows — it
   * cannot close — the at-least-once window between the provider accepting a
   * send and our recording that it did (Task 0 #6).
   */
  idempotencyKey?: string;
}

export type EmailSendResult =
  | { ok: true; id?: string }
  /** `provider` = answered non-2xx; `transport` = never answered. Both map
   *  straight onto the repository's stable failure codes. */
  | { ok: false; code: "provider" | "transport"; detail: string };

export interface EmailTransport {
  readonly name: EmailTransportName;
  /**
   * Whether a successful `send` means a message actually left the building.
   *
   * ⚠️ THIS EXISTS BECAUSE `ok: true` WAS NOT THE SAME QUESTION. `LogTransport`
   * prints and returns `{ ok: true }`, and the send flow reads `ok` as "the
   * provider accepted it" and stamps `notifiedAt` / `confirmationSentAt`. So a
   * worker on the `log` transport — the value `.env.example` ships, and the
   * fallback for an unset or misspelled `EMAIL_PROVIDER` — mailed nobody while
   * writing a clean delivery record. The lead then became invisible to BOTH
   * operator recovery paths (`queue:replay` filters on `notifiedAt: null`) and
   * would render as delivered in Story 4.7's admin view. Two review lenses
   * filed it as HIGH.
   *
   * `memory` DELIVERS: it retains the message, and the CI suite's exactly-once
   * counts are taken from it.
   */
  readonly delivers: boolean;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/** CR, LF and NUL are the characters that can break out of a header. */
export function isHeaderSafe(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 0x0a || code === 0x0d || code === 0x00) return false;
  }
  return true;
}

/**
 * Throws rather than sanitizing. Every subject this project sends is built from
 * a DB-minted reference, so an unsafe one means a caller started interpolating
 * buyer input into a header — a defect to fix, not a value to clean up. The
 * schema's standing doctrine: refuse hostile input, never silently alter it.
 */
export function assertHeaderSafe(value: string, field: string): string {
  if (!isHeaderSafe(value)) {
    throw new Error(`[email] refusing to send: ${field} contains a header-breaking character`);
  }
  return value;
}

/** Records sends in process. The CI transport (AC13) and the instrument every
 *  send-flow test measures with — never reaches the network. */
export class MemoryTransport implements EmailTransport {
  readonly name = "memory" as const;
  /** It keeps the message, and the suite reads delivery off it. */
  readonly delivers = true;
  readonly sent: EmailMessage[] = [];
  /** FIFO of forced outcomes, consumed by ANY send; empty ⇒ success. */
  private readonly failures: EmailSendResult[] = [];
  /** A standing rule: every message it matches fails, however many there are. */
  private rule: ((message: EmailMessage) => EmailSendResult | null) | null = null;

  /** Make the NEXT send fail, whichever it is. */
  failNext(result: EmailSendResult = { ok: false, code: "provider", detail: "forced" }): void {
    this.failures.push(result);
  }

  /**
   * Fail every send MATCHING a predicate.
   *
   * ⚠️ This exists because `failNext` alone cannot express "the notification
   * keeps failing while confirmations succeed": the FIFO is consumed by both
   * sends in order, so queueing three failures for three notification attempts
   * actually starves the confirmation on attempt one. That mis-modelling made a
   * real retry test assert the wrong terminal state — the instrument was wrong,
   * not the code.
   */
  failMatching(
    predicate: (message: EmailMessage) => boolean,
    result: EmailSendResult = { ok: false, code: "provider", detail: "forced" },
  ): void {
    this.rule = (message) => (predicate(message) ? result : null);
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const ruled = this.rule?.(message) ?? null;
    if (ruled) return ruled;
    const forced = this.failures.shift();
    if (forced) return forced;
    this.sent.push(message);
    return { ok: true, id: `memory-${this.sent.length}` };
  }

  reset(): void {
    this.sent.length = 0;
    this.failures.length = 0;
    this.rule = null;
  }
}

/** Prints what WOULD be sent. The development default: a developer running the
 *  worker locally must not silently mail real buyers, and must not need a
 *  provider account to exercise the path. */
class LogTransport implements EmailTransport {
  readonly name = "log" as const;
  /** It prints. Nothing leaves. Saying so here is what stops the send flow
   *  writing a delivery stamp for mail that was never sent. */
  readonly delivers = false;
  async send(message: EmailMessage): Promise<EmailSendResult> {
    console.log(
      `[email] (log transport — nothing sent) to=${message.to} subject=${message.subject}`,
    );
    return { ok: true };
  }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** How long one provider call may take before it is abandoned as `transport`. */
const RESEND_TIMEOUT_MS = 15_000;

/**
 * The real transport: one `fetch`. Never throws — a thrown network error is
 * classified as `transport` so the caller's retry logic sees a value rather
 * than an exception.
 */
class ResendTransport implements EmailTransport {
  readonly name = "resend" as const;
  readonly delivers = true;

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const apiKey = process.env.EMAIL_API_KEY?.trim();
    const from = process.env.EMAIL_FROM?.trim();
    // Callers check `isEmailConfigured` first; this is the structural backstop.
    if (!apiKey || !from) {
      return { ok: false, code: "transport", detail: "EMAIL_API_KEY or EMAIL_FROM is unset" };
    }

    const headers: Record<string, string> = {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    };
    if (message.idempotencyKey) {
      // Resend caps this at 256 characters; ours are short by construction
      // (a reference plus a kind), but truncating is cheaper than a 4xx.
      headers["Idempotency-Key"] = message.idempotencyKey.slice(0, 256);
    }

    let response: Response;
    try {
      response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
        }),
        // BOUNDED, like every other outbound client in this project. The worker
        // runs at BullMQ's default concurrency of 1, so a provider connection
        // that accepts and then never answers parks the ONLY slot for undici's
        // 300s default — every other inquiry email waits behind it. An
        // AbortError lands in the catch below and is classified `transport`,
        // which is retryable, so a genuinely slow provider costs a retry rather
        // than a stalled queue.
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
    } catch (error) {
      // No answer at all: DNS, connection refused, timeout. Retryable.
      return { ok: false, code: "transport", detail: String(error) };
    }

    if (!response.ok) {
      // The provider spoke and said no. The body may explain why; it is
      // truncated because it is remote text landing in our logs.
      const detail = await response.text().catch(() => "");
      return { ok: false, code: "provider", detail: `${response.status} ${detail.slice(0, 200)}` };
    }

    const body = (await response.json().catch(() => null)) as { id?: string } | null;
    return { ok: true, id: body?.id };
  }
}

/**
 * Select the transport from `EMAIL_PROVIDER`.
 *
 * An UNKNOWN value logs loudly and falls back to `log` — it never throws and
 * never silently picks the real provider. A typo in a deployment variable must
 * degrade to "nothing was sent, and we said so", never to "we mailed everyone
 * from a misconfigured account" and never to a crashed worker.
 */
export function createEmailTransport(name = process.env.EMAIL_PROVIDER?.trim()): EmailTransport {
  switch (name) {
    case "resend":
      return new ResendTransport();
    case "memory":
      return new MemoryTransport();
    case "log":
    case "":
    case undefined:
      return new LogTransport();
    default:
      console.error(`[email] unknown EMAIL_PROVIDER "${name}" — falling back to the log transport`);
      return new LogTransport();
  }
}

/**
 * THE ONE FUNCTION THAT READS `RFQ_NOTIFY_TO` (AC7).
 *
 * Story 4.8 (FR36b) repointed this at the admin-managed `SiteSettings.rfqNotifyTo`
 * — a change to this function's BODY and nothing else, exactly as this docstring
 * predicted. It is still the SINGLE reader of `RFQ_NOTIFY_TO` (the env var is the
 * FALLBACK), so `email.test.ts`'s "exactly one reader" gate stays green.
 *
 * ⚠️ THE ROW IS READ FRESH, NOT CACHED. FR36b's AC is "changing the notification
 * address routes the NEXT RFQ to it" — the notify path has no page cache to
 * `revalidateTag`, so a cached read could route one more inquiry to the old
 * address. The worker calls this once per job; a single indexed singleton lookup
 * is cheap. (This is why `SiteSettings` has a `settings` cache tag for the phone /
 * contact page reads but this recipient read is deliberately outside it.)
 *
 * `null` means "we have nowhere to send it": the caller records
 * `notify:unconfigured` and does NOT retry, because a missing recipient will
 * still be missing on the next attempt.
 */
export async function resolveNotifyRecipient(): Promise<string | null> {
  const row = await prisma.siteSettings.findUnique({
    where: { id: "singleton" },
    select: { rfqNotifyTo: true },
  });
  const configured = row?.rfqNotifyTo?.trim();
  if (configured) return configured;
  const env = process.env.RFQ_NOTIFY_TO?.trim();
  return env ? env : null;
}

/**
 * True when the selected transport can actually deliver.
 *
 * TWO WAYS TO FAIL THIS, AND THE SECOND ONE SHIPPED. A transport can be one
 * that never delivers at all (`log`), or one that delivers but has no
 * credentials (`resend` without a key). The original answered `true` for
 * everything that was not `resend`, which made the `log` transport — the
 * default for an unset `EMAIL_PROVIDER` — look configured, so the send flow
 * stamped `notifiedAt` for mail it had only printed.
 *
 * Callers treat `false` as `unconfigured`: recorded immediately, NEVER retried,
 * and with no delivery stamp, so the lead stays visible to Story 4.7 and
 * recoverable by `queue:replay` once the deployment is fixed.
 */
export function isEmailConfigured(transport: EmailTransport): boolean {
  if (!transport.delivers) return false;
  if (transport.name !== "resend") return true;
  return Boolean(process.env.EMAIL_API_KEY?.trim() && process.env.EMAIL_FROM?.trim());
}
