import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryTransport } from "@/lib/email";
import {
  attachmentLine,
  buildConfirmation,
  buildNotification,
  localeFor,
  processRfqSubmitted,
} from "./notify";
import en from "../../../messages/en.json";
import tr from "../../../messages/tr.json";
import ru from "../../../messages/ru.json";

/**
 * The send flow (Story 3.3, AC4/AC5/AC6/AC7/AC9).
 *
 * Prisma is INJECTED, not mocked at the module boundary: `processRfqSubmitted`
 * takes its repository functions as dependencies precisely so this suite needs
 * no database and no queue. The integration suite exercises the same function
 * through a real BullMQ Worker against the real queue Redis — the same code
 * both times, which is what makes these fakes honest rather than a parallel
 * universe.
 */

const savedEnv = { ...process.env };

function lead(over: Record<string, unknown> = {}) {
  return {
    id: "lead-1",
    reference: "GLH-RFQ-2042",
    name: "Elena Petrova",
    company: "Enka EPC",
    email: "elena@enka.example",
    phone: null,
    country: null,
    industry: "fire-safety",
    timeline: null,
    equipment: [],
    quantities: null,
    projectDetails: null,
    locale: "en",
    createdAt: new Date("2026-08-27T09:00:00.000Z"),
    attachmentName: null,
    attachmentMime: null,
    attachmentSizeBytes: null,
    attachmentScanStatus: null,
    notifiedAt: null,
    confirmationSentAt: null,
    deliveryFailureReason: null,
    ...over,
  };
}

/** A fake repository that records what the flow asked it to write. */
function fakeRepo(row: ReturnType<typeof lead> | null) {
  const marks: { kind: string; at: Date }[] = [];
  const failures: string[] = [];
  return {
    marks,
    failures,
    deps: {
      findLead: async () => row as never,
      markSent: async (_id: string, kind: "notify" | "confirm", at: Date) => {
        marks.push({ kind, at });
      },
      recordFailure: async (_id: string, reason: string) => {
        failures.push(reason);
      },
      now: () => new Date("2026-08-27T10:00:00.000Z"),
    },
  };
}

beforeEach(() => {
  process.env.RFQ_NOTIFY_TO = "aylin@glh.example";
});

afterEach(() => {
  for (const key of ["RFQ_NOTIFY_TO", "EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM"]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("processRfqSubmitted — the happy path (AC4)", () => {
  it("sends BOTH emails and stamps BOTH columns", async () => {
    const transport = new MemoryTransport();
    const repo = fakeRepo(lead());
    const outcome = await processRfqSubmitted("lead-1", { transport, ...repo.deps });

    expect(outcome).toMatchObject({
      status: "sent",
      notify: "sent",
      confirm: "sent",
      retry: false,
    });
    expect(transport.sent).toHaveLength(2);
    // The notification goes to US, the confirmation to the buyer.
    expect(transport.sent[0].to).toBe("aylin@glh.example");
    expect(transport.sent[1].to).toBe("elena@enka.example");
    expect(repo.marks.map((m) => m.kind)).toEqual(["notify", "confirm"]);
  });

  it("BOTH emails quote the reference the sender saw on screen", async () => {
    // The AC's one hard content requirement: the human handle must match what
    // the confirmation page showed, or a buyer quoting it reaches nothing.
    const transport = new MemoryTransport();
    await processRfqSubmitted("lead-1", { transport, ...fakeRepo(lead()).deps });
    for (const message of transport.sent) {
      expect(message.subject).toContain("GLH-RFQ-2042");
      expect(message.text).toContain("GLH-RFQ-2042");
    }
  });

  it("each send carries a per-lead, per-KIND idempotency key", async () => {
    const transport = new MemoryTransport();
    await processRfqSubmitted("lead-1", { transport, ...fakeRepo(lead()).deps });
    expect(transport.sent[0].idempotencyKey).toBe("GLH-RFQ-2042:notify");
    expect(transport.sent[1].idempotencyKey).toBe("GLH-RFQ-2042:confirm");
  });

  it("a DELETED lead completes with nothing sent and NO retry", async () => {
    // Five exponential attempts against a row that is never coming back would
    // look like a transient fault in the dashboard while being permanent.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const transport = new MemoryTransport();
    const outcome = await processRfqSubmitted("gone", { transport, ...fakeRepo(null).deps });
    expect(outcome).toMatchObject({ status: "skipped", retry: false });
    expect(transport.sent).toHaveLength(0);
    warn.mockRestore();
  });
});

describe("the per-email short-circuit — AC9's exactly-once half", () => {
  it("a retry after BOTH succeeded sends nothing", async () => {
    const transport = new MemoryTransport();
    const outcome = await processRfqSubmitted("lead-1", {
      transport,
      ...fakeRepo(
        lead({ notifiedAt: new Date("2026-08-27T09:30:00Z"), confirmationSentAt: new Date() }),
      ).deps,
    });
    expect(transport.sent).toHaveLength(0);
    expect(outcome).toMatchObject({ notify: "already", confirm: "already", retry: false });
  });

  it("THE KEYSTONE: a retry after notify-succeeded/confirm-failed sends ONLY the confirmation", async () => {
    // The scenario AC9 describes. The two stamps are checked INDEPENDENTLY —
    // a single "sent" flag would either re-send the notification or skip the
    // confirmation, and both are wrong.
    const transport = new MemoryTransport();
    const repo = fakeRepo(lead({ notifiedAt: new Date("2026-08-27T09:30:00Z") }));
    const outcome = await processRfqSubmitted("lead-1", { transport, ...repo.deps });

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe("elena@enka.example");
    expect(outcome).toMatchObject({ notify: "already", confirm: "sent" });
    // And the notification column is NOT re-stamped.
    expect(repo.marks.map((m) => m.kind)).toEqual(["confirm"]);
  });

  it("the reverse: confirm-sent/notify-pending sends ONLY the notification", async () => {
    const transport = new MemoryTransport();
    await processRfqSubmitted("lead-1", {
      transport,
      ...fakeRepo(lead({ confirmationSentAt: new Date("2026-08-27T09:30:00Z") })).deps,
    });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe("aylin@glh.example");
  });
});

describe("failure handling (AC8) — retry, and record only when TERMINAL", () => {
  it("a provider failure asks for a retry and records NOTHING mid-flight", async () => {
    // A reason column that flickered during retries would mislead Story 4.7's
    // admin view into showing a failure that is still expected to succeed.
    const transport = new MemoryTransport();
    transport.failNext();
    const repo = fakeRepo(lead());
    const outcome = await processRfqSubmitted("lead-1", {
      transport,
      ...repo.deps,
      isFinalAttempt: false,
    });
    expect(outcome.retry).toBe(true);
    expect(outcome.notify).toBe("failed");
    expect(repo.failures).toEqual([]);
  });

  it("on the FINAL attempt the failure is recorded with its prefixed stable code", async () => {
    const transport = new MemoryTransport();
    transport.failNext({ ok: false, code: "provider", detail: "429" });
    const repo = fakeRepo(lead());
    await processRfqSubmitted("lead-1", { transport, ...repo.deps, isFinalAttempt: true });
    // `notify:provider` — which send, and why, in one self-sufficient column.
    expect(repo.failures).toEqual(["notify:provider"]);
  });

  it("the confirmation is attempted even when the notification failed", async () => {
    // Independent sends: the buyer's receipt must not be held hostage to our
    // own inbox being unreachable.
    const transport = new MemoryTransport();
    transport.failNext();
    const repo = fakeRepo(lead());
    const outcome = await processRfqSubmitted("lead-1", { transport, ...repo.deps });
    expect(outcome.confirm).toBe("sent");
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0].to).toBe("elena@enka.example");
  });

  it("BOTH failing on the final attempt records BOTH codes", async () => {
    const transport = new MemoryTransport();
    transport.failNext({ ok: false, code: "provider", detail: "x" });
    transport.failNext({ ok: false, code: "transport", detail: "y" });
    const repo = fakeRepo(lead());
    await processRfqSubmitted("lead-1", { transport, ...repo.deps, isFinalAttempt: true });
    expect(repo.failures).toEqual(["notify:provider", "confirm:transport"]);
  });
});

describe("unconfigured notification (AC7/Task 0 #12)", () => {
  it("no RFQ_NOTIFY_TO → recorded as `unconfigured`, NEVER retried, confirmation unaffected", async () => {
    // A missing environment variable will still be missing on the next
    // attempt, so retrying is pure noise — and the buyer must still get their
    // receipt regardless of our own misconfiguration.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.RFQ_NOTIFY_TO;
    const transport = new MemoryTransport();
    const repo = fakeRepo(lead());
    const outcome = await processRfqSubmitted("lead-1", { transport, ...repo.deps });

    expect(outcome.notify).toBe("unconfigured");
    expect(outcome.retry).toBe(false);
    expect(repo.failures).toEqual(["notify:unconfigured"]);
    expect(outcome.confirm).toBe("sent");
    expect(transport.sent).toHaveLength(1);
    error.mockRestore();
  });
});

describe("content contracts (AC5/AC6)", () => {
  it("the confirmation is written in the LEAD's locale, EN when null", () => {
    expect(localeFor({ locale: "tr" } as never)).toBe("tr");
    expect(localeFor({ locale: "ru" } as never)).toBe("ru");
    expect(localeFor({ locale: null } as never)).toBe("en");
    // A locale outside the routing set falls back rather than throwing.
    expect(localeFor({ locale: "de" } as never)).toBe("en");

    const turkish = buildConfirmation(lead({ locale: "tr" }) as never);
    expect(turkish.text).toContain(tr.RfqEmail.confirmSignoff);
    expect(turkish.subject).toContain("Talebiniz");
    const russian = buildConfirmation(lead({ locale: "ru" }) as never);
    expect(russian.text).toContain("Здравствуйте");
  });

  it("the NOTIFICATION is EN regardless of the lead's locale (Task 0 #13)", () => {
    // It is an internal operational document; localizing it by the buyer's
    // locale would make Aylin's inbox polyglot.
    const notification = buildNotification(lead({ locale: "ru" }) as never);
    expect(notification.subject).toBe("New RFQ GLH-RFQ-2042");
    expect(notification.text).toContain(en.RfqEmail.notifyIntro);
  });

  it("NO DURATIONS anywhere in the confirmation (Task 0 #1, an Asim decision)", () => {
    // The on-screen SLA line reads `Industry.sla`, one of the four keys Story
    // 3.5 will DELETE. If this email ever quoted it, the literal string
    // "Industry.sla" would ship to customers the moment 3.5 landed — invisible
    // to every other gate. Asserting the SHAPE of the catalogue is what makes
    // that structurally impossible rather than merely currently-true.
    //
    // ⚠️ DIGITS ALONE ARE NOT ENOUGH, and the first version of this guard
    // checked only digits — so "we reply within twenty-four hours" and
    // "same-day review" both sailed through the very check named for stopping
    // them. A duration promise does not need a numeral. The guard now also
    // refuses spelled-out numbers and the time-unit vocabulary in all three
    // languages, so an SLA claim has to evade a word list rather than a
    // character class.
    // TIME UNITS, not numerals — and the difference was found by running this
    // against the real copy. A numeral list flagged the Turkish confirmation on
    // "**bir** GLH mühendisi", where `bir` is the indefinite article ("a"), not
    // a number. Units are both safer and STRONGER: every duration promise names
    // one ("twenty-four hours", "same-day", "within a day", "24 saat", "24
    // часов"), while a confirmation that promises nothing has no reason to
    // mention time at all.
    const DURATION_WORDS = new RegExp(
      [
        "\\b(hour|hours|day|days|week|weeks|business|working)\\b",
        "\\b(saat|gün|günü|gününde|hafta|haftada)\\b",
        "\\b(час|часа|часов|день|дня|дней|рабочий|рабочих|неделя|недели)\\b",
      ].join("|"),
      "i",
    );

    for (const [locale, catalogue] of [
      ["en", en],
      ["tr", tr],
      ["ru", ru],
    ] as const) {
      for (const [key, value] of Object.entries(catalogue.RfqEmail)) {
        if (!key.startsWith("confirm")) continue;
        const bare = String(value).replace(/\{[^}]*\}/g, "");
        expect(bare, `${locale}.${key} must carry no digits`).not.toMatch(/\d/);
        expect(bare, `${locale}.${key} must carry no duration wording`).not.toMatch(DURATION_WORDS);
      }
    }

    // The guard must actually catch the phrasings that motivated it — proving
    // the word list is not decorative.
    for (const phrasing of [
      "We reply within twenty-four hours",
      "Same-day review",
      "We reply within a day",
      "24 saat içinde",
      "в течение 24 часов",
    ]) {
      expect(
        /\d/.test(phrasing) || DURATION_WORDS.test(phrasing),
        `the guard must catch: ${phrasing}`,
      ).toBe(true);
    }

    const body = buildConfirmation(lead() as never).text;
    expect(body).not.toMatch(/24\s*h|3\s*(working|business)?\s*day/i);
    expect(body).not.toMatch(DURATION_WORDS);
  });

  it("the attachment line covers the THREE reachable states and NEVER links", () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      String((en.RfqEmail as Record<string, string>)[key]).replace(/\{(\w+)\}/g, (_, name) =>
        String(values?.[name] ?? ""),
      );

    // none → no section at all.
    expect(attachmentLine(lead() as never, t)).toBeNull();
    expect(
      attachmentLine(lead({ attachmentName: "spec.pdf", attachmentScanStatus: null }) as never, t),
    ).toBeNull();

    const clean = attachmentLine(
      lead({
        attachmentName: "spec.pdf",
        attachmentSizeBytes: 4096,
        attachmentScanStatus: "clean",
      }) as never,
      t,
    )!;
    expect(clean).toContain("spec.pdf");
    expect(clean).toContain("4 KB");

    // `failed` = the scan passed but storage lost it. The line must NOT imply
    // we are holding a file, because `attachmentKey` is null.
    const failed = attachmentLine(
      lead({ attachmentName: "spec.pdf", attachmentScanStatus: "failed" }) as never,
      t,
    )!;
    expect(failed).toContain("could not be retained");
    expect(failed).toContain("NOT stored");

    // No branch ever emits a URL: no serving route exists until Story 4.7, and
    // an emailed copy would escape the quarantine state machine forever.
    for (const line of [clean, failed]) {
      expect(line).not.toMatch(/https?:\/\//);
      expect(line).not.toContain("quarantine/");
    }
  });

  it("the notification NEVER carries the storage key or an attachment", () => {
    const notification = buildNotification(
      lead({
        attachmentName: "spec.pdf",
        attachmentSizeBytes: 2048,
        attachmentScanStatus: "clean",
      }) as never,
    );
    expect(notification.text).not.toContain("quarantine/");
    expect(notification.text).not.toMatch(/https?:\/\//);
  });

  it("the SUBJECT is built from the reference alone — buyer strings stay in the body", () => {
    // The header-injection guard (Task 0 #10). A name carrying CR/LF is inert
    // in a body and catastrophic in a header; `assertHeaderSafe` would throw if
    // one ever reached the subject, so the subject must not interpolate it.
    const hostile = `Elena${String.fromCharCode(13, 10)}Bcc: evil@example.com`;
    const notification = buildNotification(lead({ name: hostile }) as never);
    expect(notification.subject).toBe("New RFQ GLH-RFQ-2042");
    expect(notification.subject).not.toContain("Bcc");
    // …and it survives in the body, where a newline means nothing.
    expect(notification.text).toContain("Bcc: evil@example.com");

    const confirmation = buildConfirmation(lead({ name: hostile }) as never);
    expect(confirmation.subject).toBe("We have your inquiry — GLH-RFQ-2042");
  });
});
