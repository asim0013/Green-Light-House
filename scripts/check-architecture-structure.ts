/**
 * Architecture structure gate — Story 3.0 code review (AC10 / Task 4's P5 proof).
 *
 * WHY THIS EXISTS. The architecture document's structure block is normative: it is
 * where an implementing agent looks up "where does this live?". It rotted for two
 * whole epics (Epic 1 action T3 was raised, never actioned) and named
 * `src/middleware.ts`, `tailwind.config.ts` and `api/search/route.ts` — none of
 * which exist. Story 3.0 claimed to have fixed that and to have "negative-proven
 * the edits are real"; the code review found SIX of the fourteen prescribed edits
 * unapplied and no proof mechanism built at all. Prose cannot police prose. This
 * script is the mechanism.
 *
 * WHAT IT ASSERTS. Every path token in the fenced tree either exists on disk, or
 * its comment carries an explicit not-yet marker (NOT BUILT / EPIC n / PHASED /
 * "there is no…"). A path that is silently absent is drift; a path that is
 * absent-and-labelled is a plan.
 *
 * ⚠️ THIS IS DELIBERATELY *NOT* WIRED INTO CI, AND THAT IS NOT AN OVERSIGHT.
 * `_bmad-output/` is gitignored (`.gitignore:78`), so the architecture document is
 * not in the repository CI checks out. A CI-wired version could never see its own
 * subject: it would skip on every run and report success forever — the precise
 * anti-pattern (a check that cannot fail) this review exists to stamp out. It is a
 * LOCAL gate: run `npm run check:architecture` in any story that edits the
 * architecture. Wiring it to CI requires committing the document first, which is a
 * separate decision with its own trade-offs.
 *
 * Usage:  npm run check:architecture
 * Exit:   0 = every path accounted for · 1 = drift (or the block could not be found)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
const ARCH_DIR = join(REPO_ROOT, "_bmad-output/planning-artifacts/architecture");

/** Markers that make an absent path a PLAN rather than DRIFT. */
const NOT_YET = /NOT BUILT|EPIC \d|PHASED|there is NO |no api\/|and not planned/i;

/** Tokens that are prose, globs or elisions rather than real paths. */
function isPathish(token: string): boolean {
  if (!token) return false;
  if (token.startsWith("(")) return false; // "(no services/ layer)", "(co-located …)"
  if (token === "+" || token === "/" || token === "·") return false;
  if (token.includes("*") || token.includes("…") || token.includes("<")) return false;
  return /^[A-Za-z0-9._[\]{},@-]/.test(token);
}

/** Expand `messages/{en,tr,ru}.json` and `components/{ui, catalog}/` into members. */
function expandBraces(token: string): string[] {
  const match = /^(.*)\{([^}]*)\}(.*)$/.exec(token);
  if (!match) return [token];
  const [, head, body, tail] = match;
  return body
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${head}${part}${tail}`);
}

function findArchFile(): string {
  const candidates = readdirSync(ARCH_DIR).filter(
    (name) => name.startsWith("architecture") && name.endsWith(".md"),
  );
  if (candidates.length !== 1) {
    console.error(
      `Expected exactly one architecture*.md in ${ARCH_DIR}, found ${candidates.length}.`,
    );
    process.exit(1);
  }
  return join(ARCH_DIR, candidates[0]!);
}

const archFile = findArchFile();
const lines = readFileSync(archFile, "utf8").split(/\r?\n/);

// Locate the fenced block whose first content line is the repo root.
const rootIndex = lines.findIndex((line) => line.trim() === "greenlighthouse/");
if (rootIndex === -1) {
  console.error("Could not find the `greenlighthouse/` structure block. Has the format changed?");
  process.exit(1);
}
const endIndex = lines.findIndex((line, i) => i > rootIndex && line.trim() === "```");
if (endIndex === -1) {
  console.error("Structure block is not closed by a ``` fence.");
  process.exit(1);
}

type Entry = { path: string; line: number; comment: string };
const entries: Entry[] = [];
const stack: string[] = [];

for (let i = rootIndex + 1; i < endIndex; i++) {
  const raw = lines[i]!;
  const connector = /[├└]── /.exec(raw);

  // A continuation line: no connector, so its comment belongs to the entry above.
  if (!connector) {
    const hash = raw.indexOf("#");
    if (hash !== -1 && entries.length > 0)
      entries[entries.length - 1]!.comment += " " + raw.slice(hash);
    continue;
  }

  const depth = Math.floor(connector.index / 4);
  const rest = raw.slice(connector.index + 4);
  const hash = rest.indexOf("#");
  const namePart = (hash === -1 ? rest : rest.slice(0, hash)).trim();
  const comment = hash === -1 ? "" : rest.slice(hash);

  stack.length = depth;
  // Brace groups may contain spaces (`components/{ui, catalog, layout}/`), so
  // collapse whitespace INSIDE braces before tokenizing on whitespace — otherwise
  // the group is torn into fragments like `{ui,` and `catalog,`.
  const normalized = namePart.replace(/\{[^}]*\}/g, (group) => group.replace(/\s+/g, ""));
  // Split on whitespace and bare " / " alternatives ("Dockerfile / Dockerfile.worker").
  const tokens = normalized.split(/\s+/).filter(isPathish).flatMap(expandBraces);
  if (tokens.length === 0) {
    // e.g. "(no services/ layer)" — prose, but keep depth bookkeeping sane.
    stack[depth] = "";
    if (entries.length > 0) entries[entries.length - 1]!.comment += " " + comment;
    continue;
  }

  // The FIRST token defines the tree position; the rest are siblings on one line.
  stack[depth] = tokens[0]!.replace(/\/$/, "");
  const prefix = stack.slice(0, depth).filter(Boolean).join("/");

  for (const token of tokens) {
    const clean = token.replace(/\/$/, "");
    entries.push({
      path: prefix ? `${prefix}/${clean}` : clean,
      line: i + 1,
      comment,
    });
  }
}

const drift: Entry[] = [];
const planned: Entry[] = [];

for (const entry of entries) {
  if (existsSync(join(REPO_ROOT, entry.path))) continue;
  (NOT_YET.test(entry.comment) ? planned : drift).push(entry);
}

console.log(
  `Checked ${entries.length} path tokens from ${archFile.replace(REPO_ROOT + "\\", "").replace(/\\/g, "/")}:${rootIndex + 1}`,
);
console.log(`  ${entries.length - drift.length - planned.length} exist on disk`);
console.log(`  ${planned.length} absent but explicitly labelled (NOT BUILT / EPIC n / PHASED)`);

if (drift.length > 0) {
  console.error(
    `\n✗ ${drift.length} path(s) named by the architecture do NOT exist and are NOT labelled:\n`,
  );
  for (const entry of drift) {
    console.error(`  ${archFile.split(/[\\/]/).pop()}:${entry.line}  ${entry.path}`);
  }
  console.error(
    `\nEither the path is stale (fix the document) or the work is pending (label it\n` +
      `NOT BUILT / EPIC n / PHASED so the next reader can tell drift from a plan).`,
  );
  process.exit(1);
}

console.log("\n✓ Every path in the architecture structure block is accounted for.");
