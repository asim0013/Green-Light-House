// @vitest-environment node
import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * Story 5.3 (FR47, AC2) — the leads-store split is only correct if the ROUTING is
 * complete: once `LEADS_DATABASE_URL` names a regional database, one stray Lead
 * access on the catalog client sends personal data to the wrong jurisdiction (or
 * backs up an empty table).
 *
 * TWO LAYERS, honestly scoped (two review rounds showed text-only gates are evadable):
 *  1. THE TYPE SYSTEM is the primary guard. `prisma` is typed
 *     `Omit<PrismaClient, "lead">` (src/lib/db.ts), so every direct TypeScript route
 *     to `lead` on the catalog client — alias, destructure, bracket, split line —
 *     is a compile error.
 *  2. THIS TEXT GATE covers what the types cannot see:
 *     - plain JS files (`.js/.mjs/.cjs`): ANY `<x>.lead` except `leadsDb.lead`;
 *     - raw SQL on the catalog client whose ARGUMENT mentions `leads` or
 *       `lead_reference_seq` — template, `Prisma.sql`, across lines;
 *     - `<x>.lead` anywhere inside a catalog `prisma.$transaction(…)` call, whatever
 *       the callback's form (Prisma types its `tx` as a full client).
 *
 * KNOWN RESIDUAL HOLES (accepted, documented in docs/data-residency.md as "strong
 * guards, not a proof"): an explicit `as any`/`as unknown as` cast in TypeScript; a
 * `$transaction` handler defined elsewhere and passed by name; `$queryRawUnsafe(sql)`
 * where the SQL is built in a variable. Code review remains part of the control.
 *
 * Comments are removed with the TypeScript SCANNER (template- and regex-literal
 * aware), not a regex — a regex stripper let `"//"` or `"src/*"` inside a string
 * swallow the code after it (re-review GATE-2).
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

const isPlainJs = (f: string) => /\.(js|mjs|cjs)$/.test(f);

/** Tokens after which a `/` starts a REGEX literal rather than a division. */
const DIVISION_PRECEDERS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.Identifier,
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
  ts.SyntaxKind.ThisKeyword,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
]);

/**
 * The source with every comment replaced by a space, using the TypeScript scanner.
 * Handles template literals (re-scans the text after each `${…}`) and regex
 * literals (re-scans `/` when it cannot be a division), so strings, templates and
 * regexes containing `//` or `/*` are kept intact.
 */
export function stripComments(src: string, jsx: boolean): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    jsx ? ts.LanguageVariant.JSX : ts.LanguageVariant.Standard,
    src,
  );
  let out = "";
  let prev = ts.SyntaxKind.Unknown;
  const templateBraceDepth: number[] = [];
  let braceDepth = 0;
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    if (
      kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      out += " ";
      continue;
    }
    if (kind === ts.SyntaxKind.TemplateHead) {
      templateBraceDepth.push(braceDepth);
    } else if (kind === ts.SyntaxKind.OpenBraceToken) {
      braceDepth++;
    } else if (kind === ts.SyntaxKind.CloseBraceToken) {
      if (
        templateBraceDepth.length &&
        templateBraceDepth[templateBraceDepth.length - 1] === braceDepth
      ) {
        kind = scanner.reScanTemplateToken(false);
        if (kind === ts.SyntaxKind.TemplateTail) templateBraceDepth.pop();
      } else {
        braceDepth--;
      }
    } else if (
      (kind === ts.SyntaxKind.SlashToken || kind === ts.SyntaxKind.SlashEqualsToken) &&
      !DIVISION_PRECEDERS.has(prev)
    ) {
      kind = scanner.reScanSlashToken();
    }
    out += scanner.getTokenText();
    if (kind !== ts.SyntaxKind.WhitespaceTrivia && kind !== ts.SyntaxKind.NewLineTrivia) {
      prev = kind;
    }
  }
  return out;
}

function code(file: string): string {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    return ""; // listed but deleted in the working tree
  }
  return stripComments(src, /\.(tsx|jsx)$/.test(file));
}

const sources = files.map((f) => ({ f, src: code(f) }));

/** From the bracket at `start`, the text up to its matching close — string/template contents skipped. */
function balanced(src: string, start: number): string {
  const open = src[start];
  const close = open === "(" ? ")" : open === "<" ? ">" : "}";
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      // skip a string/template literal (escapes honoured; nested ${} not needed for depth)
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return src.slice(start, i + 1);
  }
  return src.slice(start);
}

/** The argument text of a call/tagged template starting at `i` (after optional generics). */
function argumentText(src: string, i: number): string {
  while (/\s/.test(src[i] ?? "")) i++;
  if (src[i] === "<") {
    i += balanced(src, i).length;
    while (/\s/.test(src[i] ?? "")) i++;
  }
  if (src[i] === "`") {
    let j = i + 1;
    for (; j < src.length && src[j] !== "`"; j++) if (src[j] === "\\") j++;
    return src.slice(i, j + 1);
  }
  if (src[i] === "(") return balanced(src, i);
  return "";
}

const snippet = (s: string) => s.replace(/\s+/g, " ").slice(0, 120);

describe("leads-store routing (Story 5.3)", () => {
  it("scans a real file set (the gate is not vacuous)", () => {
    expect(files.length).toBeGreaterThan(100);
    // If the repository stopped using leadsDb, the rules below would pass trivially.
    const repo = sources.find((s) => s.f === "src/server/repositories/lead.ts")!.src;
    expect((repo.match(/\bleadsDb\.lead\b/g) ?? []).length).toBeGreaterThanOrEqual(10);
  });

  it("the comment stripper keeps code that follows `//` or `/*` inside strings, templates and regexes", () => {
    const src = [
      'const u = "//"; prisma.lead.findMany();',
      "const g = 'src/*'; x();",
      "const t = `a // ${b} /* c`; y();",
      "const r = /\\/\\//; z(); // real comment",
      "/* block */ w();",
    ].join("\n");
    const out = stripComments(src, false);
    for (const kept of ["prisma.lead.findMany()", "x()", "y()", "z()", "w()", '"//"', "'src/*'"]) {
      expect(out).toContain(kept);
    }
    expect(out).not.toContain("real comment");
    expect(out).not.toContain("block");
  });

  it('no Lead access through the catalog client (`prisma.lead` / `prisma["lead"]`)', () => {
    const out: string[] = [];
    for (const { f, src } of sources) {
      for (const m of src.matchAll(/\bprisma\s*(\.\s*lead\b|\[\s*["'`]lead["'`]\s*\])/g))
        out.push(`${f}: ${snippet(m[0])}`);
    }
    expect(out).toEqual([]);
  });

  it("plain JS files (no type layer): no `<x>.lead` except `leadsDb.lead`", () => {
    const out: string[] = [];
    for (const { f, src } of sources.filter((s) => isPlainJs(s.f))) {
      for (const m of src.matchAll(
        /\b(?!leadsDb\b)[A-Za-z_$][\w$]*\s*\)?\s*(\.\s*lead\b|\[\s*["'`]lead["'`]\s*\])/g,
      )) {
        out.push(`${f}: ${snippet(m[0])}`);
      }
    }
    expect(out).toEqual([]);
  });

  it("leadsDb is used for the Lead model and its sequence ONLY — never the catalog", () => {
    const out: string[] = [];
    for (const { f, src } of sources) {
      for (const m of src.matchAll(
        /\bleadsDb\s*\.\s*(?!lead\b|\$queryRaw\b|\$disconnect\b)[\w$]+/g,
      )) {
        out.push(`${f}: ${snippet(m[0])}`);
      }
    }
    expect(out).toEqual([]);
  });

  it("raw SQL on leads / lead_reference_seq never runs on the catalog client (any argument form)", () => {
    const out: string[] = [];
    for (const { f, src } of sources) {
      for (const m of src.matchAll(/\bprisma\s*\.\s*\$(queryRaw|executeRaw)[\w$]*/g)) {
        const arg = argumentText(src, m.index! + m[0].length);
        if (/lead_reference_seq|\bleads\b/.test(arg)) out.push(`${f}: ${snippet(m[0] + arg)}`);
      }
    }
    expect(out).toEqual([]);
  });

  it("no catalog `prisma.$transaction(…)` touches Lead, whatever the callback's form", () => {
    const out: string[] = [];
    for (const { f, src } of sources) {
      for (const m of src.matchAll(/\bprisma\s*\.\s*\$transaction\s*(?=[(<])/g)) {
        const body = argumentText(src, m.index! + m[0].length);
        for (const hit of body.matchAll(
          /\b(?!leadsDb\b)[A-Za-z_$][\w$]*\s*(\.\s*lead\b|\[\s*["'`]lead["'`]\s*\])/g,
        )) {
          out.push(`${f}: ${snippet(hit[0])}`);
        }
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
