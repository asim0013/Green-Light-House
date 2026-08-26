import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { eicarSignature } from "../../scripts/attachment-fixtures";

/**
 * REPO BYTE HYGIENE (Story 3.7b, AC16) — a permanent gate, not a command
 * somebody remembers to run.
 *
 * Two classes of byte have now drawn blood in this project repeatedly, and both
 * are invisible in a diff:
 *
 *  1. **RAW CONTROL CHARACTERS.** The editor used to write this codebase
 *     converts `\uXXXX` and `\xNN` escapes in string literals into the actual
 *     bytes — five incidents. Story 3.1's page file became BINARY to git and
 *     grep because of one NUL, and its own review then reproduced the byte by
 *     quoting the fix. A committed bidi override is worse: it silently changes
 *     how the source READS versus how it RUNS.
 *
 *  2. **THE EICAR SIGNATURE.** It is defined BY its 68 bytes, so any file
 *     containing them is quarantined by the developer's own antivirus, by
 *     GitHub's scanners and by CI runners — turning a green branch into an
 *     un-clonable one. Story 3.7b keeps it assembled at runtime
 *     (`scripts/attachment-fixtures.ts`); this is what keeps it that way.
 *
 * ⚠️ THE NEEDLE IS BUILT AT RUN TIME, from the same fragments the fixture uses.
 * Writing the search pattern down here would plant the very bytes the test
 * exists to forbid — which is not hypothetical: it happened once already, while
 * writing this story, by quoting the guard's own grep pattern into a document.
 */

/** Tracked files only: `git ls-files` skips node_modules, .next and build output. */
function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files"], { encoding: "utf8", cwd: process.cwd() })
    .split("\n")
    .filter(Boolean);
}

/** Text-ish sources. Binary fixtures (there are none tracked today) would be
 *  false positives for the control-byte rule, so the sweep is scoped by
 *  extension rather than guessing from content. */
const SOURCE_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|prisma|sql|html)$/;

/**
 * Legal control characters in source: tab (0x09), LF (0x0a), CR (0x0d) — an
 * EXPLICIT allowlist, nothing else in C0, plus DEL, is tolerated.
 *
 * ⚠️ Was a range check (`byte > 0x0d && byte < 0x20`) until the 3.7b review:
 * that shape silently legalised the whole 0x09–0x0d run, so VT (0x0b) and
 * FF (0x0c) — two control characters this gate is named for — passed as clean.
 * The session's ad-hoc byte-sweeps shared the same formula, so every sweep the
 * story ran had the same blind spot. Allowlists name what is legal; ranges
 * quietly legalise what sits between the endpoints.
 */
function offendingBytes(buffer: Buffer): number[] {
  const found = new Set<number>();
  for (const byte of buffer) {
    if ((byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte === 0x7f) {
      found.add(byte);
    }
  }
  return [...found];
}

/**
 * The bidi embedding/override set, by CODE POINT.
 *
 * NOT a character class with literal members: writing those code points as
 * unicode escapes is precisely what the editor converts into the RAW BYTES
 * this test forbids, and it did exactly that here on the first attempt: the guard file
 * failed its own rule and only passed because it was not yet tracked. Numbers
 * cannot be transcoded.
 */
const BIDI_CODES = new Set([
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069,
]);

function hasBidi(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (BIDI_CODES.has(text.charCodeAt(i))) return true;
  }
  return false;
}

describe("tracked source carries no hostile bytes", () => {
  const files = trackedFiles().filter((file) => SOURCE_EXTENSIONS.test(file));

  it("the file list is not empty (guards against a vacuous sweep)", () => {
    // Without this, a `git ls-files` that returned nothing — wrong cwd, no git,
    // a shallow checkout — would make every assertion below pass over an empty
    // set and report a clean repo forever.
    expect(files.length).toBeGreaterThan(50);
  });

  it("no NUL, no stray C0 control characters, no DEL", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const bytes = offendingBytes(readFileSync(file));
      if (bytes.length > 0) {
        offenders.push(`${file}: ${bytes.map((b) => `0x${b.toString(16)}`).join(", ")}`);
      }
    }
    expect(offenders, "raw control bytes in tracked source").toEqual([]);
  });

  it("no bidi embedding or override characters", () => {
    const offenders = files.filter((file) => hasBidi(readFileSync(file, "utf8")));
    expect(offenders, "bidi controls in tracked source").toEqual([]);
  });

  it("no file contains the EICAR signature verbatim", () => {
    // Byte search, not a text match: the signature is a byte sequence and a
    // file need not be valid UTF-8 for it to be quarantined.
    const needle = eicarSignature();
    // The assembly is self-checked in the fixture, but assert it here too —
    // a mis-assembled needle would find nothing and this gate would pass
    // vacuously forever, which is the exact class of defect it exists to catch.
    expect(needle.length, "needle must be the real 68-byte signature").toBe(68);

    const offenders = trackedFiles().filter((file) => {
      // Skip anything implausibly large rather than reading it: no source file
      // here approaches this, and the cap keeps the sweep cheap.
      if (statSync(file).size > 2_000_000) return false;
      return readFileSync(file).includes(needle);
    });
    expect(offenders, "EICAR signature committed to the repository").toEqual([]);
  });
});
