import { describe, it, expect, vi } from "vitest";
import { toLeadAttachmentView, leadAttachmentHref, PENDING_MAX_AGE_MS } from "./lead-attachment";
import type { LeadAttachmentSource, LeadAttachmentView } from "./lead-attachment";

/**
 * The Story 4.7 handoff contract (Story 3.7b, AC6/AC11).
 *
 * The union already makes a wrong link a COMPILE error, so what is left for
 * runtime is the mapping itself: which stored state becomes which branch, and
 * — the one that matters — that `href` is absent as an OWN PROPERTY on every
 * branch that is not `clean`. A compile-time guarantee is worth nothing to a
 * consumer that reaches the object through `any`, JSON, or a template.
 */

const CREATED = new Date("2026-08-26T09:00:00.000Z");

function lead(overrides: Partial<LeadAttachmentSource> = {}): LeadAttachmentSource {
  return {
    id: "clx0000000000000000000000",
    createdAt: CREATED,
    attachmentKey: "quarantine/6f1a2b3c-4d5e-6f70-8192-a3b4c5d6e7f8.pdf",
    attachmentName: "datasheet.pdf",
    attachmentMime: "application/pdf",
    attachmentSizeBytes: 4096,
    attachmentScanStatus: "clean",
    attachmentScannedAt: new Date("2026-08-26T09:00:01.000Z"),
    ...overrides,
  };
}

/** `href` as an OWN property — `in` would also see a prototype member. */
function hasHref(view: LeadAttachmentView): boolean {
  return Object.prototype.hasOwnProperty.call(view, "href");
}

describe("toLeadAttachmentView — the state mapping", () => {
  it("no attachment: a null status means ABSENT, never `unscanned`", () => {
    // schema.prisma:65-67 — the invariant this whole design is built around.
    expect(toLeadAttachmentView(lead({ attachmentScanStatus: null }))).toEqual({ state: "none" });
  });

  it("clean WITH a key is the only branch that carries an href", () => {
    const view = toLeadAttachmentView(lead());
    expect(view.state).toBe("clean");
    expect(hasHref(view)).toBe(true);
    if (view.state !== "clean") throw new Error("unreachable");
    expect(view.href).toBe(leadAttachmentHref("clx0000000000000000000000"));
    expect(view.name).toBe("datasheet.pdf");
  });

  it("NO branch but `clean` has an href — the whole point of the union", () => {
    const cases: [string, LeadAttachmentSource][] = [
      ["pending", lead({ attachmentScanStatus: "pending", attachmentScannedAt: null })],
      ["infected", lead({ attachmentScanStatus: "infected" })],
      ["failed", lead({ attachmentScanStatus: "failed" })],
      ["no attachment", lead({ attachmentScanStatus: null })],
      // Upload failed after a clean scan: the verdict really was clean, but
      // there is no object, so this must NOT be downloadable.
      ["clean with no key", lead({ attachmentKey: null })],
    ];
    for (const [label, row] of cases) {
      const view = toLeadAttachmentView(row, CREATED);
      expect(hasHref(view), label).toBe(false);
      expect(view.state, label).not.toBe("clean");
    }
  });

  it("a clean row with NO key degrades to `failed`, keeping the metadata", () => {
    const view = toLeadAttachmentView(lead({ attachmentKey: null }));
    expect(view.state).toBe("failed");
    if (view.state === "none") throw new Error("unreachable");
    // Story 4.7 must still be able to say WHICH file was lost.
    expect(view.name).toBe("datasheet.pdf");
    expect(view.sizeBytes).toBe(4096);
  });

  it("the storage key appears on NO branch", () => {
    // It is server-side state, exactly as `ProjectMediaEntry.storageKey` is.
    for (const status of ["clean", "pending", "infected", "failed"] as const) {
      const view = toLeadAttachmentView(lead({ attachmentScanStatus: status }), CREATED);
      expect(JSON.stringify(view), status).not.toContain("quarantine/");
    }
  });
});

describe("toLeadAttachmentView — the stuck-`pending` rule (AC11)", () => {
  const pending = lead({ attachmentScanStatus: "pending", attachmentScannedAt: null });

  it("a FRESH pending stays pending", () => {
    const now = new Date(CREATED.getTime() + PENDING_MAX_AGE_MS - 1000);
    expect(toLeadAttachmentView(pending, now).state).toBe("pending");
  });

  it("a STALE pending becomes failed — the fail-safe direction", () => {
    // "Stuck pending" means the scan never completed. Its end is `failed`,
    // never `clean`: the one state we must never drift into is offering a
    // download for a file nothing ever scanned.
    const now = new Date(CREATED.getTime() + PENDING_MAX_AGE_MS + 1000);
    const view = toLeadAttachmentView(pending, now);
    expect(view.state).toBe("failed");
    expect(hasHref(view)).toBe(false);
  });

  it("the boundary is strictly GREATER than the threshold", () => {
    // Pins the comparison operator itself. Breaking `>` to `>=` (or flipping
    // the operands) turns exactly one of these two red.
    const exactly = new Date(CREATED.getTime() + PENDING_MAX_AGE_MS);
    expect(toLeadAttachmentView(pending, exactly).state).toBe("pending");
    expect(toLeadAttachmentView(pending, new Date(exactly.getTime() + 1)).state).toBe("failed");
  });

  it("age is measured from createdAt, not from the (null) scannedAt", () => {
    // A pending row has never been scanned, so `attachmentScannedAt` is null
    // and arithmetic on it would silently produce NaN — which compares false
    // against every threshold, leaving a stuck row pending forever.
    const view = toLeadAttachmentView(
      { ...pending, attachmentScannedAt: null },
      new Date(CREATED.getTime() + PENDING_MAX_AGE_MS * 10),
    );
    expect(view.state).toBe("failed");
  });

  it("resolves a whole list against ONE instant", () => {
    // `now` is injected precisely so a list render cannot classify two
    // identical rows differently because the clock ticked between them.
    const now = new Date(CREATED.getTime() + PENDING_MAX_AGE_MS + 1);
    const rows = [pending, pending, pending];
    const states = rows.map((row) => toLeadAttachmentView(row, now).state);
    expect(new Set(states).size).toBe(1);
  });
});

describe("leadAttachmentHref", () => {
  it("names the Story 4.7 route and encodes the id", () => {
    expect(leadAttachmentHref("abc123")).toBe("/admin/leads/abc123/attachment");
    expect(leadAttachmentHref("a/../b")).toBe("/admin/leads/a%2F..%2Fb/attachment");
  });

  it("the DEFAULT clock drives the stale-pending derivation when `now` is omitted", () => {
    // ⚠️ Rewritten in the 3.7b review, which caught the first version as a
    // test-that-cannot-fail: it exercised the default through a CLEAN lead,
    // and `now` is read only on the PENDING branch — a verifier mutated the
    // default to `new Date(0)` and the suite stayed green, so the fake-timer
    // scaffolding was inert theater. A stale pending row is the one shape that
    // actually CONSUMES the default: with the faked system clock past the
    // threshold, omitting `now` must still classify the row `failed`. Mutating
    // the default to `new Date(0)` now makes `age` hugely negative, the row
    // stays "pending", and this reddens (P5-proven in the review).
    const stale = lead({ attachmentScanStatus: "pending", attachmentScannedAt: null });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(CREATED.getTime() + PENDING_MAX_AGE_MS + 1000));
    expect(toLeadAttachmentView(stale).state).toBe("failed");
    // And below the threshold the same defaulted clock keeps it pending —
    // two sides, so neither a stuck-early nor a stuck-late default can hide.
    vi.setSystemTime(new Date(CREATED.getTime() + 1000));
    expect(toLeadAttachmentView(stale).state).toBe("pending");
    vi.useRealTimers();
  });
});
