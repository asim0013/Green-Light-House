import { describe, it, expect } from "vitest";
import { toSlaContent, type SlaProcessRow, type SlaContent } from "./sla";
import { hasSlaSummary } from "@/lib/sla-content";

/**
 * The SLA mapper (Story 3.5) — pure, so it is testable without Postgres.
 *
 * ⚠️ THE DEGENERATE BRANCH IS THE POINT OF THIS FILE. `toSlaContent` returning
 * `null` is what every one of the nine render sites keys its "render nothing" path
 * off, and that branch is REACHABLE in production: a fresh clone before
 * `db:seed`, a `migrate deploy` with no seed, or a Story 4.8 admin deleting a
 * row. Story 3.4's review found an entire acceptance criterion (AC13) shipped on
 * inspection alone; this is AC8's half of the answer, proven rather than assumed.
 *
 * Fixtures are hand-built plain objects, NOT the seed's copy: this file asserts
 * resolution behaviour, not the sentences, so it must not drift when the copy is
 * revised — and must not become a second source of it (AC5).
 */

function row(over: Partial<SlaProcessRow> = {}): SlaProcessRow {
  return {
    translations: [
      { locale: "en", kicker: "EN kicker", summary: "EN summary" },
      { locale: "tr", kicker: "TR kicker", summary: "TR summary" },
    ],
    steps: [
      {
        sort: 1,
        translations: [
          { locale: "en", badge: "B1", title: "T1", description: "D1" },
          { locale: "tr", badge: "B1tr", title: "T1tr", description: "D1tr" },
        ],
      },
      {
        sort: 2,
        translations: [{ locale: "en", badge: "B2", title: "T2", description: "D2" }],
      },
    ],
    ...over,
  };
}

describe("toSlaContent — resolution", () => {
  it("returns the requested locale and reports isFallback false", () => {
    const sla = toSlaContent(row(), "tr");
    expect(sla?.kicker).toBe("TR kicker");
    expect(sla?.summary).toBe("TR summary");
    expect(sla?.isFallback).toBe(false);
  });

  it("falls back to EN and SAYS SO (FR34a)", () => {
    // P5: hard-code `isFallback: false` and this reddens. Without the flag the
    // surfaces render English inside a Russian page with no marker — the exact
    // defect the 3.4 review found in the pre-fill banner.
    const sla = toSlaContent(row(), "ru");
    expect(sla?.summary).toBe("EN summary");
    expect(sla?.isFallback).toBe(true);
  });

  it("orders steps by `sort`, not by the order the rows arrive in", () => {
    // ⚠️ THE FIXTURE IS DELIBERATELY OUT OF ORDER. With rows already sorted, a
    // dropped `orderBy`/`sort` would change nothing observable and the test
    // could not fail — the "true by construction" class this project keeps
    // shipping. P5: delete the `.sort(...)` in `toSlaContent` — reddens.
    const shuffled = row({
      steps: [
        { sort: 3, translations: [{ locale: "en", badge: "B3", title: "T3", description: "D3" }] },
        { sort: 1, translations: [{ locale: "en", badge: "B1", title: "T1", description: "D1" }] },
        { sort: 2, translations: [{ locale: "en", badge: "B2", title: "T2", description: "D2" }] },
      ],
    });
    expect(toSlaContent(shuffled, "en")?.steps.map((s) => s.title)).toEqual(["T1", "T2", "T3"]);
  });

  it("falls a STEP back to EN independently of the process text", () => {
    // Step 2 has only EN; requesting TR must still yield both steps.
    expect(toSlaContent(row(), "tr")?.steps.map((s) => s.title)).toEqual(["T1tr", "T2"]);
  });
});

describe("toSlaContent — the degenerate branch (AC8)", () => {
  it("returns null when the process has NO translations at all", () => {
    // Renders nothing rather than fabricating a promise. P5: return a
    // hard-coded English default here and this reddens — which is precisely the
    // anti-pattern the story forbids, because a compiled fallback would mask a
    // real production content gap behind copy nobody reviewed.
    expect(toSlaContent(row({ translations: [] }), "en")).toBeNull();
  });

  it("returns null when neither the requested locale NOR EN exists", () => {
    const trOnly = row({
      translations: [{ locale: "tr", kicker: "TR kicker", summary: "TR summary" }],
    });
    expect(toSlaContent(trOnly, "ru")).toBeNull();
  });

  it("DROPS a step with no usable translation rather than rendering it blank", () => {
    // A stepper row with an empty badge and no title is worse than a shorter
    // stepper: it looks like a rendering bug to a buyer.
    const withBlank = row({
      steps: [
        { sort: 1, translations: [{ locale: "en", badge: "B1", title: "T1", description: "D1" }] },
        { sort: 2, translations: [] },
      ],
    });
    expect(toSlaContent(withBlank, "en")?.steps.map((s) => s.title)).toEqual(["T1"]);
  });

  it("a process with translations but ZERO steps still resolves (summary-only)", () => {
    // The seven one-liner surfaces need only the summary, so an empty step list is
    // a usable state — not the degenerate one.
    const sla = toSlaContent(row({ steps: [] }), "en");
    expect(sla).not.toBeNull();
    expect(sla?.summary).toBe("EN summary");
    expect(sla?.steps).toEqual([]);
  });
});

describe("hasSlaSummary — the guard the seven one-liner surfaces use", () => {
  const withSummary = (summary: string) => ({
    kicker: "k",
    summary,
    steps: [],
    isFallback: false,
  });

  it("is false for null, so an unseeded model draws no chrome", () => {
    expect(hasSlaSummary(null)).toBe(false);
  });

  it("is FALSE for an empty or whitespace summary — the defect it exists to close", () => {
    // ⚠️ THE SEVEN SUMMARY SURFACES USED TO GUARD ON `sla &&` ALONE, and `HomeHero`
    // carried the comment "border would otherwise draw above nothing" while
    // testing only that the ROW exists. A row whose summary an admin blanked is
    // non-null, so every one of the six drew its rule, padding and uppercase
    // frame around an empty string.
    //
    // P5: change the implementation to `sla !== null` and both of these redden.
    expect(hasSlaSummary(withSummary(""))).toBe(false);
    expect(hasSlaSummary(withSummary("   "))).toBe(false);
    expect(hasSlaSummary(withSummary("\n\t "))).toBe(false);
  });

  it("is true for real copy", () => {
    expect(hasSlaSummary(withSummary("Technical review in 24 h"))).toBe(true);
  });

  it("narrows the type, so callers may pass it straight to SlaSummary", () => {
    // The `sla is SlaContent` predicate is what lets the seven call sites write
    // `hasSlaSummary(sla) && <SlaSummary sla={sla} …/>` without a non-null
    // assertion. If the signature loses the predicate this stops compiling.
    const maybe: SlaContent | null = withSummary("x");
    if (hasSlaSummary(maybe)) expect(maybe.summary).toBe("x");
    else throw new Error("unreachable");
  });
});
