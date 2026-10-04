// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * Story 5.3 (FR47, AC2) — the leads-store split is only correct if the ROUTING is
 * complete: once `LEADS_DATABASE_URL` names a regional database, one stray Lead
 * access on the catalog client sends personal data to the wrong jurisdiction (or
 * backs up an empty table).
 *
 * TWO LAYERS, honestly scoped (review MED-1 showed the first version of this gate
 * was evadable by aliasing, destructuring, brackets, split calls and `.mjs`):
 *  1. THE TYPE SYSTEM is the primary guard. `prisma` is typed
 *     `Omit<PrismaClient, "lead">` (src/lib/db.ts), so every direct route to
 *     `lead` on the catalog client — alias, destructure, bracket, split line —
 *     is a compile error in TypeScript.
 *  2. THIS TEXT GATE covers what the types cannot see: plain JS files
 *     (`.js/.mjs/.cjs`), raw SQL against `leads` / `lead_reference_seq` on the
 *     catalog client (even across lines), and interactive `$transaction`
 *     callbacks — Prisma types their `tx` as a full client, `lead` included.
 *
 * Scanned: src/, scripts/, worker/ — tests included (their cleanups must hit the
 * right store too). The e2e harness builds its own clients via
 * `resolveLeadsDatabaseUrl()` and is out of scope. Files come from
 * `--cached --others`: an index-only listing lets a NEW untracked file escape.
 */
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "--", "src", "scripts", "worker"],
  { encoding: "utf8" },
)
  .split("\n")
  .filter((f) => /\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(f) && !f.endsWith("lead-routing.test.ts"));

/**
 * The file's CODE: block and line comments removed (comments legitimately name
 * `prisma.lead` when explaining history — and a `/* x *\/ prisma.lead` line must
 * NOT be mistaken for a comment). `//` preceded by `:` is kept (URLs).
 */
function code(file: string): string {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return ""; // listed but deleted in the working tree
  }
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:\\])\/\/.*$/gm, "$1");
}

const sources = files.map((f) => ({ f, src: code(f) }));

/** `f: snippet` for every match of `re` (global) in the comment-free code. */
function hits(re: RegExp, accept: (m: RegExpExecArray) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const { f, src } of sources) {
    for (const m of src.matchAll(re)) {
      if (accept(m)) out.push(`${f}: ${m[0].replace(/\s+/g, " ").slice(0, 120)}`);
    }
  }
  return out;
}

/** The text from an opening paren at `start` to its matching close (strings ignored — good enough here). */
function balanced(src: string, start: number): string {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

describe("leads-store routing (Story 5.3)", () => {
  it("scans a real file set (the gate is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
    // If the repository stopped using leadsDb, the rules below would pass trivially.
    const repo = sources.find((s) => s.f === "src/server/repositories/lead.ts")!.src;
    expect((repo.match(/\bleadsDb\.lead\b/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it('no Lead access through the catalog client in ANY file, incl. plain JS (`prisma.lead` / `prisma["lead"]`)', () => {
    expect(hits(/\bprisma\s*(\.\s*lead\b|\[\s*["'`]lead["'`]\s*\])/g)).toEqual([]);
  });

  it("leadsDb is used for the Lead model and its sequence ONLY — never the catalog", () => {
    expect(hits(/\bleadsDb\s*\.\s*(?!lead\b|\$queryRaw\b|\$disconnect\b)\w+/g)).toEqual([]);
  });

  it("raw SQL on leads / lead_reference_seq never runs on the catalog client — even across lines", () => {
    expect(
      hits(
        /\bprisma\s*\.\s*\$(queryRaw|executeRaw)\w*\s*(<[^>]*>)?\s*(`[^`]*`|\(\s*(`[^`]*`|"[^"]*"|'[^']*')[^)]*\))/g,
        (m) => /lead_reference_seq|\bleads\b/.test(m[0]),
      ),
    ).toEqual([]);
  });

  it("no catalog-client $transaction callback touches Lead (Prisma types `tx` with `lead`)", () => {
    const out: string[] = [];
    for (const { f, src } of sources) {
      for (const m of src.matchAll(/\bprisma\s*\.\s*\$transaction\s*\(/g)) {
        const body = balanced(src, m.index! + m[0].length - 1);
        const param = body.match(/^\(\s*async\s*\(?\s*(\w+)/)?.[1];
        if (param && new RegExp(`\\b${param}\\s*\\.\\s*lead\\b`).test(body))
          out.push(`${f}: ${param}.lead`);
      }
    }
    expect(out).toEqual([]);
  });

  it("the backup export and the queue ops script read leads from the leads store", () => {
    for (const f of ["src/server/admin/backup/export.ts", "scripts/queue-ops.ts"]) {
      expect(/\bleadsDb\.lead\b/.test(sources.find((s) => s.f === f)?.src ?? ""), f).toBe(true);
    }
  });
});
