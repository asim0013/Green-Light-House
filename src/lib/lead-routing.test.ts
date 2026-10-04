// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Story 5.3 (FR47, AC2) — the leads store split is only correct if the ROUTING is
 * complete. One stray `prisma.lead` and, once `LEADS_DATABASE_URL` points at a
 * regional database, that read/write silently goes to the catalog database instead:
 * personal data in the wrong jurisdiction, or a backup of an empty table.
 *
 * Scanned: every TS file under src/, scripts/ and worker/ — tests included (their
 * cleanups must hit the right store too). The e2e harness builds its own clients
 * and resolves the leads URL via `e2e/dbReady.ts` instead; it is out of this scan.
 *
 * Files are listed with `--cached --others`: a git-INDEX-only scan lets a brand-new
 * untracked file escape the gate (Story 3.6's lesson).
 */
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src", "scripts", "worker"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => /\.(ts|tsx|mts)$/.test(f) && !f.endsWith("lead-routing.test.ts"));

/** Code lines only — comments legitimately name `prisma.lead` when explaining history. */
function codeLines(file: string): Array<{ n: number; text: string }> {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return []; // listed but deleted in the working tree
  }
  return src
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }))
    .filter(({ text }) => !/^\s*(\*|\/\/|\/\*)/.test(text));
}

const hits = (re: RegExp) =>
  files.flatMap((f) => codeLines(f).filter(({ text }) => re.test(text)).map(({ n, text }) => `${f}:${n}: ${text.trim()}`));

describe("leads-store routing (Story 5.3)", () => {
  it("scans a real file set (the gate is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
    // The repository is the leads store's main user; if it stopped using leadsDb
    // entirely the two rules below would pass trivially.
    const repo = codeLines("src/server/repositories/lead.ts").filter(({ text }) => /\bleadsDb\.lead\b/.test(text));
    expect(repo.length).toBeGreaterThanOrEqual(10);
  });

  it("no Lead access goes through the catalog client (`prisma.lead`)", () => {
    expect(hits(/\bprisma\.lead\b/)).toEqual([]);
  });

  it("leadsDb is used for the Lead model and its sequence ONLY — never the catalog", () => {
    expect(hits(/\bleadsDb\.(?!lead\b|\$queryRaw\b|\$disconnect\b)\w+/)).toEqual([]);
  });

  it("raw SQL on leads or lead_reference_seq never runs on the catalog client", () => {
    expect(
      hits(/\bprisma\.\$(queryRaw|executeRaw)\w*.*(lead_reference_seq|\bleads\b)/),
    ).toEqual([]);
  });

  it("the backup export and the queue ops script read leads from the leads store", () => {
    for (const f of ["src/server/admin/backup/export.ts", "scripts/queue-ops.ts"]) {
      expect(codeLines(f).some(({ text }) => /\bleadsDb\.lead\b/.test(text)), f).toBe(true);
    }
  });
});
