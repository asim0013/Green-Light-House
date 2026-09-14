import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * FR31 PRESENCE INVARIANT (Story 3.6, AC1) — a permanent gate, not a one-time
 * audit. Every public surface that renders an RFQ CTA must also render a
 * `tel:` action, so a buyer can always call from wherever they can inquire.
 *
 * ⚠️ THE INVARIANT ALREADY HOLDS — which is exactly why this file's own
 * FALSIFIABILITY is the deliverable, not the green result. All eleven RFQ-link
 * sites carry a phone today; a gate written against a tree that already
 * satisfies it is the single easiest place in this codebase to ship a test that
 * cannot fail (§J, Rule P5). So the invariant is factored into two PURE
 * predicates, `hasRfqCta` and `hasTelAction`, and the self-checks below run them
 * over SYNTHETIC inputs — an RFQ CTA with no phone MUST be flagged, a
 * phone-only surface MUST NOT be — proving the sweep can go red without ever
 * committing a red file to the tree.
 *
 * ⚠️ IT KEYS ON THE RENDERED HREF, NOT ON `SITE.rfqHref`. Story 3.4 rewrote
 * three CTAs onto the doorway helpers (`rfqIndustryHref`, `rfqProductHref`), so
 * they no longer mention `rfqHref` at all. A gate scoped to that identifier
 * would silently exempt exactly the three surfaces 3.4 touched — the gate-scope
 * failure this project keeps shipping. `hasRfqCta` recognises all four
 * construction paths, and a self-check ties its vocabulary to the exported
 * helper list so a NEW helper cannot escape it (this is also what keeps the
 * currently-dead `rfqCategoryHref` covered the moment it gains a caller).
 *
 * ⚠️ IT IS ONE-DIRECTIONAL. Phone-without-RFQ is legitimate — the three
 * not-found surfaces and the header carry a `tel:` with no RFQ CTA and must not
 * be flagged. The sweep iterates RFQ sites only.
 *
 * ⚠️ THE PROXY IS FILE-LEVEL, AND THIS SAYS SO. AC1 says "the same rendered
 * region"; a unit test cannot mount these async server components to inspect a
 * region, so file co-location is the honest proxy — an RFQ CTA and a `tel:`
 * anchor in the same source file. Stated here rather than letting a reader
 * believe the DOM region is checked.
 */

/**
 * Every file git would ship: tracked PLUS untracked-but-not-ignored.
 *
 * ⚠️ THIS IS A THIRD COPY OF THIS HELPER ON PURPOSE, AND IT IS THE
 * UNTRACKED-INCLUSIVE VARIANT DELIBERATELY. `sla-hygiene.test.ts` lists tracked
 * + `--others`; `source-hygiene.test.ts` lists tracked only. They are NOT the
 * same function and must not be merged: this gate is proven (§H #1) by adding a
 * synthetic component with an RFQ CTA and no phone, which is UNTRACKED when the
 * suite runs — and a developer who has just written a new component has not
 * staged it either. Under a tracked-only helper that file is invisible, the gate
 * stays green, and the proof records a pass while proving nothing. Widening
 * `source-hygiene`'s helper instead would silently broaden a live hostile-bytes
 * sweep for no stated reason. `--exclude-standard` keeps `.gitignore` honoured.
 */
function trackedFiles(): string[] {
  const listed = (args: string[]) =>
    execFileSync("git", ["ls-files", ...args], { encoding: "utf8", cwd: process.cwd() })
      .split("\n")
      .filter(Boolean);
  return [...new Set([...listed([]), ...listed(["--others", "--exclude-standard"])])];
}

/**
 * Strip block and line comments so a docstring that MENTIONS `/rfq` or `tel:`
 * (`ProductCard`, `FormSectionCard`, `RfqRail`, `ProjectFactsCard` all do) is
 * not miscounted as a render site. The `[^:]` guard keeps `https://` from being
 * read as a line comment.
 */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/**
 * Renders a link whose href resolves to `/rfq` — via `SITE.rfqHref` (incl. the
 * `` `${SITE.rfqHref}?project=…` `` template) OR any of the doorway helpers.
 */
export function hasRfqCta(source: string): boolean {
  const code = stripComments(source);
  return (
    /\bSITE\.rfqHref\b/.test(code) ||
    /\brfq(?:Product|Industry|Project|Category)Href\s*\(/.test(code)
  );
}

/** Renders an `a[href^="tel:"]` — the `href="tel:…"` and `` href={`tel:…`} `` forms. */
export function hasTelAction(source: string): boolean {
  const code = stripComments(source);
  return /href=\{?["'`]?\s*tel:/.test(code);
}

const isRenderFile = (file: string) =>
  /^src\/(components|app)\//.test(file) && /\.tsx$/.test(file) && !/\.(test|spec)\.tsx$/.test(file);

describe("every RFQ CTA surface also carries a phone action (AC1)", () => {
  const renderFiles = trackedFiles().filter(isRenderFile);
  const rfqSites = renderFiles.filter((file) => hasRfqCta(readFileSync(file, "utf8")));

  it("SELF-CHECK: the gate CAN fail — an RFQ CTA with no phone is flagged (§H #1)", () => {
    // The whole deliverable. The invariant holds across the tree, so without this
    // the sweep below only ever passes. A synthetic surface with an RFQ CTA and
    // no `tel:` is a violation under the exact predicates the real sweep uses.
    const synthetic = `export const X = () => <a href={rfqProductHref("x")}>Inquire</a>;`;
    expect(hasRfqCta(synthetic)).toBe(true);
    expect(hasTelAction(synthetic)).toBe(false);
    // i.e. `hasRfqCta && !hasTelAction` === a violation.
  });

  it("SELF-CHECK: the gate sees a DOORWAY href, not just `SITE.rfqHref` (§H #2)", () => {
    expect(hasRfqCta(`<Link href={rfqIndustryHref(slug)}>`)).toBe(true);
    expect(hasRfqCta(`<Link href={rfqProductHref(slug)}>`)).toBe(true);
    expect(hasRfqCta(`<a href={SITE.rfqHref}>`)).toBe(true);
    expect(hasRfqCta(`<a href={\`\${SITE.rfqHref}?project=\${slug}\`}>`)).toBe(true);
    // A comment-only mention is NOT a render site.
    expect(hasRfqCta(`// the /rfq doorway; see rfqProductHref(slug)`)).toBe(false);
    expect(hasRfqCta(`/* links to SITE.rfqHref elsewhere */`)).toBe(false);
  });

  it("SELF-CHECK: the gate is ONE-DIRECTIONAL — phone-without-RFQ is not flagged (§H #3)", () => {
    const phoneOnly = `<a href={\`tel:\${SITE.phone}\`}>{SITE.phoneDisplay}</a>`;
    expect(hasTelAction(phoneOnly)).toBe(true);
    expect(hasRfqCta(phoneOnly)).toBe(false); // never enters the sweep, so never a violation
  });

  it("SELF-CHECK: `hasTelAction` recognises both href forms", () => {
    expect(hasTelAction(`<a href={\`tel:\${SITE.phone}\`}>`)).toBe(true);
    expect(hasTelAction(`<a href="tel:+902121234567">`)).toBe(true);
    expect(hasTelAction(`<a href={SITE.rfqHref}>Inquire</a>`)).toBe(false);
  });

  it("SELF-CHECK: the RFQ-href vocabulary covers every exported helper (Task 5)", () => {
    // The dead-helper guard. `rfqCategoryHref` renders nowhere today, so a gate
    // built from render sites alone would never notice if a FIFTH helper were
    // added and left undetected. Tie the vocabulary to the source of truth: every
    // `export function rfq*Href` in rfq-href.ts must be recognised by hasRfqCta.
    // P5: add `export function rfqFooHref(s){return "/rfq"}` and this reddens
    // until the predicate's alternation is widened to include it.
    const src = readFileSync("src/lib/rfq-href.ts", "utf8");
    const exported = [...src.matchAll(/export function (rfq\w*Href)\s*\(/g)].map((m) => m[1]);
    expect(exported.length, "no RFQ href builders found — regex drifted").toBeGreaterThanOrEqual(4);
    const uncovered = exported.filter((name) => !hasRfqCta(`x = ${name}(slug)`));
    expect(uncovered, "an exported RFQ href builder is invisible to the gate").toEqual([]);
  });

  it("SELF-CHECK: discovery is non-vacuous and spans all four construction paths", () => {
    // A discovery regex that silently stopped matching would turn the gate green
    // forever. Assert a floor AND name one site from each of the paths that carry
    // a phone today, so losing a whole construction path is caught.
    expect(rfqSites.length, "RFQ render-site discovery found nothing").toBeGreaterThanOrEqual(10);
    for (const required of [
      "src/components/layout/SiteHeader.tsx", // SITE.rfqHref
      "src/components/projects/ProjectCta.tsx", // `${SITE.rfqHref}?project=…` template
      "src/components/catalog/ProductAnchorCard.tsx", // rfqProductHref
      "src/components/industry/IndustryHero.tsx", // rfqIndustryHref
    ]) {
      expect(rfqSites, `discovery no longer sees ${required}`).toContain(required);
    }
  });

  it("every RFQ CTA surface renders a phone action in the same file", () => {
    const violations = rfqSites.filter((file) => !hasTelAction(readFileSync(file, "utf8")));
    expect(violations, "an RFQ CTA surface has no `tel:` action (FR31 presence invariant)").toEqual(
      [],
    );
  });
});

/**
 * THE 44px FLOOR IS DECLARED, NOT ARITHMETIC (AC2).
 *
 * ⚠️ `buttonClasses`' `PADDED` is `px-5 py-[13px]`, which at 15px text resolves
 * to ≈43px — UNDER the 44px touch-target floor. So the floor cannot be left to
 * padding: every `tel:` anchor declares `min-h-11` explicitly. This sweeps the
 * OPENING TAG of each `tel:` anchor for the class, whether it is written inline
 * or passed through `buttonClasses(...)` (the class still appears verbatim in
 * the tag). Six sites cleared the floor only incidentally before this story.
 */
describe("every `tel:` anchor declares an explicit min-h-11 (AC2)", () => {
  const telSites = trackedFiles()
    .filter(isRenderFile)
    .filter((file) => hasTelAction(readFileSync(file, "utf8")));

  // Each `<a … tel: … >` OPENING tag. This relies on the tag containing no `>`
  // before it closes — true for every tel: anchor today. The parity self-check
  // below is what makes that reliance SAFE rather than assumed: if some future
  // anchor put a `>` inside its attributes (e.g. an inline `onClick={() => …}`
  // ahead of the href), `[^>]*?` would truncate and silently drop that anchor —
  // a sweep that skips silently (§K). The parity check turns that into a RED.
  const telAnchorTags = (source: string) =>
    [...stripComments(source).matchAll(/<a\b[^>]*?tel:[^>]*?>/g)].map((m) => m[0]);

  // How many tel: hrefs the file actually contains (comment-stripped), regardless
  // of tag shape — the ground truth the tag matcher must not undercount.
  const telHrefCount = (source: string) =>
    (stripComments(source).match(/href=\{?["'`]?\s*tel:/g) ?? []).length;

  it("SELF-CHECK: discovery is non-vacuous and the tag matcher misses no tel: anchor", () => {
    expect(telSites.length, "tel: render-site discovery found nothing").toBeGreaterThanOrEqual(15);
    let total = 0;
    for (const file of telSites) {
      const src = readFileSync(file, "utf8");
      const tags = telAnchorTags(src).length;
      const hrefs = telHrefCount(src);
      // ⚠️ THE SILENT-SKIP GUARD. Every tel: href must resolve to exactly one
      // matched opening tag; a shortfall means the tag regex dropped an anchor
      // and that anchor would escape the min-h-11 sweep unseen.
      expect(tags, `${file}: tag matcher saw ${tags} of ${hrefs} tel: anchors`).toBe(hrefs);
      total += tags;
    }
    // 15 sites, and TalkCard carries TWO tel: anchors after this story.
    expect(total, "no tel: opening tags matched — the tag regex drifted").toBeGreaterThanOrEqual(
      16,
    );
  });

  it("no tel: anchor relies on padding arithmetic for the 44px floor", () => {
    // P5: remove `min-h-11` from any one tel: anchor and this reddens, naming
    // the file and the offending tag.
    const violations: string[] = [];
    for (const file of telSites) {
      for (const tag of telAnchorTags(readFileSync(file, "utf8"))) {
        if (!/\bmin-h-11\b/.test(tag)) violations.push(`${file}: ${tag.slice(0, 60)}…`);
      }
    }
    expect(violations, "a tel: anchor has no explicit min-h-11").toEqual([]);
  });
});
