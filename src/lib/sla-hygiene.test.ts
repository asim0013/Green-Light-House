import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { slaCopyNeedles } from "../../scripts/sla-fixtures";

/**
 * SINGLE-SOURCE SLA COPY (Story 3.5, AC5) — a permanent gate, not a command
 * somebody remembers to run.
 *
 * ⚠️ WHAT THIS EXISTS TO PREVENT, stated concretely. Before this story the SLA
 * sentence was byte-copied into FOUR `messages/` namespaces plus a fifth key for
 * the kicker — fifteen strings across three locales — and the 2.6 review found
 * that TR and RU had ADDITIONALLY inlined the numbers into `ctaLead` prose, a
 * copy the next revision would have missed. FR30 requires the SLA be editable
 * without a deploy; a second copy anywhere makes that promise false, because an
 * admin's edit reaches the model and the duplicate keeps promising the old
 * numbers. So: the copy lives in the content model, and NOWHERE else.
 *
 * ⚠️ THE NEEDLES ARE DERIVED AT RUN TIME from `scripts/sla-fixtures.ts`, the
 * module the seed writes into the database. That is what keeps the gate honest:
 * a gate that hard-coded the sentences would CONTAIN the sentences, so it would
 * either match itself forever or need an exemption for itself — the
 * self-matching-grep trap `source-hygiene.test.ts` already solved. This file
 * contains no SLA copy at all.
 *
 * ⚠️ NOTHING IS ALLOWLISTED. There is exactly one legal home for the copy and it
 * is named below. An allowlist is how a gate becomes decorative — the standing
 * lesson from the Story 3.4 review, which found three gates that could not fail.
 */

/** Tracked files only: `git ls-files` skips node_modules, .next and build output. */
function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8", cwd: process.cwd() })
    .split("\n")
    .filter(Boolean);
}

const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|prisma|sql|html)$/;

/**
 * The ONE file allowed to contain the copy: the fixture module the seed writes
 * from and this gate reads from.
 *
 * ⚠️ NOT AN ALLOWLIST — it is the subject. Sweeping the source for a string
 * while including the file that defines that string would be the self-matching
 * grep. Story documents under `_bmad-output/` are untracked (gitignored), so
 * they never enter the sweep; if that ever changes they must NOT be exempted
 * here — a planning document quoting the copy is a second source like any other.
 */
const CONTENT_MODEL_SOURCE = "scripts/sla-fixtures.ts";

/**
 * The sweep covers APPLICATION source — the code and catalogues that can render
 * to a buyer.
 *
 * ⚠️ `_bmad-output/` IS OUT OF SCOPE, AND THAT IS NOT AN ALLOWLIST. That tree is
 * the planning and design record, and the recovered Pencil canvas under
 * `ux-designs/` is where this copy was SPECIFIED in the first place — the
 * `outline.md` frame the seed was transcribed from. A specification containing
 * the content it specifies is not a second implementation of it: nothing renders
 * from those files, and forbidding the design source from stating the design
 * would make the gate absurd. What the gate exists to stop is a SECOND RUNTIME
 * SOURCE, and every one of those lives under the prefixes below.
 */
const APP_PREFIXES = ["src/", "prisma/", "scripts/", "messages/", "e2e/", "worker/"];

describe("SLA copy lives in the content model and nowhere else (AC5)", () => {
  const needles = slaCopyNeedles();
  const files = trackedFiles()
    .filter((file) => SOURCE_EXTENSIONS.test(file))
    .filter((file) => APP_PREFIXES.some((prefix) => file.startsWith(prefix)));

  it("SELF-CHECK: the needle list is populated", () => {
    // Without this, a fixture refactor that emptied `slaCopyNeedles()` would
    // make every assertion below pass over nothing and report a clean repo
    // forever — the vacuous-sweep failure this project has shipped before.
    // 3 locales x (kicker + summary) = 6, plus 3 steps x 3 locales of description = 9.
    expect(needles.length).toBeGreaterThanOrEqual(15);
    expect(needles.every((n) => n.trim().length > 0)).toBe(true);
  });

  it("SELF-CHECK: the sweep actually FINDS the copy in the content model's own source", () => {
    // The other half of the vacuous-sweep guard: proves the matcher works at
    // all. If this fails, the "no duplicates" result below means nothing —
    // it would be reporting that a broken search found nothing.
    const source = readFileSync(CONTENT_MODEL_SOURCE, "utf8");
    const missing = needles.filter((needle) => !source.includes(needle));
    expect(missing, `needles absent from ${CONTENT_MODEL_SOURCE}`).toEqual([]);
  });

  it("SELF-CHECK: the file list is not empty", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no tracked file outside the content model repeats any SLA string", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file === CONTENT_MODEL_SOURCE) continue;
      const text = readFileSync(file, "utf8");
      for (const needle of needles) {
        if (text.includes(needle)) offenders.push(`${file}: ${needle.slice(0, 48)}`);
      }
    }
    expect(offenders, "SLA copy duplicated outside the content model").toEqual([]);
  });

  it("no locale catalogue carries an `sla` or `slaKicker` key any more", () => {
    // The deletion half of AC1, asserted structurally rather than by counting.
    // ⚠️ NEXT-INTL DOES NOT THROW ON A MISSING KEY here and `t()` is not
    // compiler-checked, so a call site left behind renders the literal string
    // `Home.sla` to a buyer with the whole suite green. This is the gate that
    // notices, together with the `t("sla")` sweep below.
    for (const locale of ["en", "tr", "ru"]) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      const namespaces = Object.values(messages) as Record<string, unknown>[];
      const stray = namespaces.filter(
        (ns) => ns && typeof ns === "object" && ("sla" in ns || "slaKicker" in ns),
      );
      expect(stray, `${locale}.json still carries an sla/slaKicker key`).toEqual([]);
    }
  });

  it("no component still reads the deleted translation keys", () => {
    // The call-site half. A surviving `t("sla")` compiles, renders 200, and
    // shows a key path to a buyer — so the source is swept directly.
    const offenders = files
      .filter((file) => file.startsWith("src/") && /\.tsx?$/.test(file))
      .filter((file) => {
        const text = readFileSync(file, "utf8");
        return /\bt(?:Industry)?\(\s*["']sla(?:Kicker)?["']\s*\)/.test(text);
      });
    expect(offenders, "a component still reads a deleted SLA key").toEqual([]);
  });
});
