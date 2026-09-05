import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { slaCopyNeedles, slaLabelNeedles } from "../../scripts/sla-fixtures";
import { routing } from "@/i18n/routing";

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

/**
 * Every file git would ship: tracked, PLUS untracked-but-not-ignored.
 *
 * ⚠️ THE SECOND HALF IS A FIX, AND IT CLOSES THE HOLE THAT BIT THIS STORY.
 * `git ls-files` alone reads the INDEX, so a brand-new file containing the copy
 * verbatim was invisible until somebody ran `git add`. That is not theoretical:
 * this gate reported green at commit `c1ce493` while three real offenders sat in
 * the working tree, and only started failing once committing put them in the
 * index. A gate whose result depends on whether you have staged yet is a gate
 * that lies at exactly the moment you consult it. `--exclude-standard` keeps
 * `.gitignore` honoured, so `node_modules`, `.next` and build output stay out.
 */
function trackedFiles(): string[] {
  const listed = (args: string[]) =>
    execFileSync("git", ["ls-files", ...args], { encoding: "utf8", cwd: process.cwd() })
      .split("\n")
      .filter(Boolean);
  return [...new Set([...listed([]), ...listed(["--others", "--exclude-standard"])])];
}

// `.svg` is here deliberately: Next serves `src/app/**` file-convention images
// (icon.svg, opengraph-image.svg, apple-icon.svg) to real users, and SVG carries
// text. A verbatim SLA promise inside one would render to a buyer while every
// other sweep stayed green.
const SOURCE_EXTENSIONS =
  /\.(ts|tsx|js|jsx|mjs|cjs|json|md|yml|yaml|css|prisma|sql|html|svg|txt|webmanifest)$/;

/**
 * The ONE file allowed to contain the copy: the fixture module the seed writes
 * from and this gate reads from.
 *
 * ⚠️ NOT AN ALLOWLIST — it is the subject. Sweeping the source for a string
 * while including the file that defines that string would be the self-matching
 * grep.
 */
const CONTENT_MODEL_SOURCE = "scripts/sla-fixtures.ts";

/**
 * The sweep covers APPLICATION source — the code and catalogues that can render
 * to a buyer.
 *
 * ⚠️ `_bmad-output/` IS OUT OF SCOPE, AND THAT IS NOT AN ALLOWLIST — but the
 * reason this comment used to give was FACTUALLY WRONG and is corrected here.
 * It claimed those files are "untracked (gitignored), so they never enter the
 * sweep". They are not: EIGHT files under `_bmad-output/planning-artifacts/`
 * are tracked, including the recovered Pencil canvas and `EXPERIENCE.md`, and
 * several of them do contain this copy. They are excluded because that tree is
 * the DESIGN RECORD — the `outline.md` frame the seed was transcribed from —
 * and a specification containing the content it specifies is not a second
 * implementation of it. Nothing renders from those files. The exclusion is
 * about what can reach a buyer, never about what git happens to track.
 *
 * ⚠️ `public/` AND THE REPOSITORY ROOT ARE IN SCOPE, added after a reviewer
 * staged a verbatim copy in each and watched the gate pass. `public/` is copied
 * into the runtime image and served at the site root; root-level files
 * (`next.config.ts`, `README.md`, manifests) ship too. Root files are matched by
 * having no `/` in their path.
 */
const APP_PREFIXES = ["src/", "prisma/", "scripts/", "messages/", "e2e/", "worker/", "public/"];

/** In scope: anything under an app prefix, plus every file at the repo root. */
const inScope = (file: string) =>
  APP_PREFIXES.some((prefix) => file.startsWith(prefix)) || !file.includes("/");

/**
 * Remove block and line comments.
 *
 * A docstring that mentions a call form, or explains why a string was deleted,
 * is not a call site and is not a second source of the copy. Without this the
 * gates flag their own explanations — which is how a gate starts collecting
 * exemptions and stops meaning anything. The `[^:]` guard keeps `https://` from
 * being read as a line comment.
 */
const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

describe("SLA copy lives in the content model and nowhere else (AC5)", () => {
  const needles = slaCopyNeedles();
  const files = trackedFiles()
    .filter((file) => SOURCE_EXTENSIONS.test(file))
    .filter(inScope);

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

  it("SELF-CHECK: the sweep reaches every scope it claims to cover", () => {
    // ⚠️ A BARE `length > 50` WAS NOT A COVERAGE CHECK. The sweep sees several
    // hundred files, so that floor tolerated losing most of them — and, worse, it
    // was blind to losing an entire SCOPE: drop `messages/` from APP_PREFIXES, or
    // break the `.json` extension, and the count stays comfortably over 50 while
    // the catalogues go unswept. Assert the SHAPE of the coverage instead, by
    // naming one file from each scope that must be in it.
    expect(files.length).toBeGreaterThan(100);
    for (const required of [
      "messages/en.json",
      "messages/tr.json",
      "messages/ru.json",
      "prisma/seed.ts",
      "src/components/sla/SlaStepper.tsx",
      "src/server/repositories/sla.ts",
      "e2e/caching.spec.ts",
    ]) {
      expect(files, `the sweep no longer covers ${required}`).toContain(required);
    }
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
    // notices, together with the call-site sweep below.
    // ⚠️ RECURSES TO ANY DEPTH, and that is a fix, not a flourish. The original
    // check walked `Object.values(messages)` — exactly ONE level — so it could
    // only ever see `Namespace.sla`. This catalogue already nests to depth 3
    // (`Rfq.timeline`, `Rfq.errors`), so `Rfq.timeline.sla` would have passed
    // the gate, and the AC's own stated P5 ("re-add an `sla` value under any
    // namespace") was therefore satisfiable in a way that could not fail.
    const straysIn = (node: unknown, path: string): string[] => {
      if (!node || typeof node !== "object" || Array.isArray(node)) return [];
      const found: string[] = [];
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        if (key === "sla" || key === "slaKicker") found.push(`${path}${key}`);
        found.push(...straysIn(value, `${path}${key}.`));
      }
      return found;
    };

    // Locales from `routing`, not a hard-coded triple: `routing.ts` states that
    // the locale list has ONE home, and a fourth locale added there would
    // otherwise ship an unswept catalogue.
    expect(routing.locales.length).toBeGreaterThanOrEqual(3);
    for (const locale of routing.locales) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      const stray = straysIn(messages, "");
      expect(stray, `${locale}.json still carries an sla/slaKicker key`).toEqual([]);
    }
  });

  it("no component still reads the deleted translation keys", () => {
    // The call-site half. A surviving read of a deleted key compiles, renders
    // 200, and shows a key path to a buyer — so the source is swept directly.
    //
    // ⚠️ THE PATTERN IS NOT WRITTEN OUT IN PROSE ANYWHERE IN THIS FILE, and that
    // is deliberate rather than stylistic. This sweep runs over `src/**`, which
    // INCLUDES this file: a comment quoting the call form verbatim makes the gate
    // match itself and fail on its own explanation. `source-hygiene.test.ts`
    // learned the identical lesson from the EICAR needle — do not write the guard
    // pattern down. The regex below is the only place it appears, and it does not
    // match its own source.
    // ⚠️ THE OLD PATTERN MATCHED ONLY TWO TRANSLATOR NAMES AND ONLY A
    // ZERO-ARGUMENT CALL. This codebase already uses more — `tNav` and `tFooter`
    // are live in shipped components — and the rich-text form takes a second
    // argument, so `tNav("sla")` or the rich form would have carried a deleted
    // key straight past this gate and rendered a key path to a buyer.
    //
    // The identifier is TRANSLATOR-SHAPED on purpose: `t` plus an optional
    // Capitalised suffix. Matching any identifier at all was tried and was too
    // loose in two ways worth recording — it flagged `toBe("sla")` in
    // `cache-tags.test.ts`, where `sla` is the CACHE TAG and entirely legitimate,
    // and it flagged a comment. Comments are stripped for the same reason.
    const deletedKeyCall = new RegExp(
      String.raw`\bt(?:[A-Z][\w$]*)?(?:\.(?:rich|raw|markup|has))?\(\s*["'\`]` +
        String.raw`sla(?:Kicker)?["'\`]\s*[),]`,
    );
    const offenders = files
      .filter((file) => file.startsWith("src/") && /\.tsx?$/.test(file))
      .filter((file) => deletedKeyCall.test(stripComments(readFileSync(file, "utf8"))));
    expect(offenders, "a component still reads a deleted SLA key").toEqual([]);
  });
});

/**
 * THE NUMERIC PROMISE, swept over the RENDER LAYER (AC5, second half).
 *
 * ⚠️ WHY THIS EXISTS SEPARATELY. The sweep above matches SENTENCES, and that
 * left a hole a reviewer demonstrated: a component could hard-code "24h",
 * "3 days" and the step names — the entire commercial commitment FR30 requires
 * an admin to be able to edit without a deploy — and the gate stayed green,
 * because none of those strings is a sentence.
 *
 * ⚠️ WHY IT IS SCOPED AND COMMENT-STRIPPED rather than folded into the sweep
 * above. Labels are short and collide with ordinary prose: "Teknik
 * değerlendirme" is just how Turkish says "technical review" and it occurs
 * innocently in `messages/tr.json`. So this sweeps only the files that RENDER
 * (`src/components/**`, `src/app/**`), skips their tests, and strips comments
 * first — a docstring explaining why the copy is stored is not a second source
 * of it; a rendered string literal is.
 */
describe("the SLA numeric promise is not hard-coded in the render layer (AC5)", () => {
  const labels = slaLabelNeedles();
  const renderFiles = trackedFiles()
    .filter((file) => /\.tsx?$/.test(file))
    .filter((file) => file.startsWith("src/components/") || file.startsWith("src/app/"))
    .filter((file) => !/\.(test|spec)\.tsx?$/.test(file));

  it("SELF-CHECK: the label needles and the render-file list are both populated", () => {
    // 3 steps x 3 locales of titles = 9, plus the duration badges of steps 1-2
    // in 3 locales = 6. The arrow is excluded on purpose (a glyph, not a promise).
    expect(labels.length).toBeGreaterThanOrEqual(15);
    expect(labels.every((n) => n.trim().length > 0)).toBe(true);
    expect(renderFiles.length).toBeGreaterThan(40);
  });

  it("SELF-CHECK: the comment stripper removes a docstring but keeps a rendered literal", () => {
    // Without this, a stripper that ate everything would make the sweep below
    // pass over nothing — the vacuous-gate failure this project has shipped
    // before. The needle is built here, never written out.
    const needle = labels[0];
    expect(stripComments(`/** promises ${needle} */`)).not.toContain(needle);
    expect(stripComments(`// promises ${needle}`)).not.toContain(needle);
    expect(stripComments(`const x = "${needle}";`)).toContain(needle);
    // A URL must not be mistaken for a line comment.
    expect(stripComments(`const u = "https://x/y";`)).toContain("https://x/y");
  });

  it("no component or page hard-codes a step title or a duration badge", () => {
    const offenders: string[] = [];
    for (const file of renderFiles) {
      const text = stripComments(readFileSync(file, "utf8"));
      for (const label of labels) {
        if (text.includes(label)) offenders.push(`${file}: ${label}`);
      }
    }
    expect(offenders, "the SLA promise is hard-coded outside the content model").toEqual([]);
  });
});

/**
 * EVERY SLA RENDER SITE PASSES THE TONE ITS GROUND REQUIRES (AC3, AC4, §F #43).
 *
 * ⚠️ TONE IS A CONTRAST REQUIREMENT, NOT STYLING, AND NOTHING PINNED IT. The
 * components' own tests prove that `tone="onDark"` and `tone="light"` produce
 * different classes — but no test anywhere asserted which one each of the EIGHT
 * call sites actually passes. Flipping any single site was therefore invisible:
 * `FallbackNotice`'s light token measures 2.96:1 on the ink band, and the dark
 * token is white-on-white on the confirmation card. Both are AA failures on the
 * one string UJ3's "fallback is honest" promise rests on, and both would ship
 * with the entire suite green.
 *
 * Structural rather than rendered on purpose: three of these eight sites sit
 * inside async server components that a unit test cannot mount, so a
 * render-based check could only ever cover five of them and would silently
 * report success for the rest.
 */
describe("every SLA render site passes the tone its ground requires", () => {
  /** file → the tone that file's ground demands. Eight sites, named individually. */
  const EXPECTED_TONE: Record<string, "light" | "onDark"> = {
    // Light grounds: white or surface cards.
    "src/components/home/HomeHero.tsx": "light",
    "src/components/catalog/ProductAnchorCard.tsx": "light",
    "src/components/rfq/RfqConfirmation.tsx": "light",
    // Ink bands and dark CTAs.
    "src/components/industry/IndustryHero.tsx": "onDark",
    "src/components/industry/IndustryCta.tsx": "onDark",
    "src/components/projects/ProjectCta.tsx": "onDark",
    "src/components/rfq/RfqRail.tsx": "onDark",
    "src/app/[locale]/(public)/services/page.tsx": "onDark",
  };

  it("SELF-CHECK: all eight sites exist and each mounts an SLA component", () => {
    // Guards the whole describe against becoming vacuous through a rename: if a
    // path here stops existing, this fails loudly instead of the sweep below
    // quietly checking nothing.
    const sites = Object.keys(EXPECTED_TONE);
    expect(sites).toHaveLength(8);
    for (const site of sites) {
      const text = readFileSync(site, "utf8");
      expect(text, `${site} no longer mounts an SLA component`).toMatch(/<Sla(Summary|Stepper)\b/);
    }
  });

  it("passes the correct tone at each site", () => {
    const wrong: string[] = [];
    for (const [site, expected] of Object.entries(EXPECTED_TONE)) {
      const text = readFileSync(site, "utf8");
      // Every `tone=` on an SLA element in this file must be the expected one.
      // No `s` flag: `[^>]` already spans newlines, and the flag needs a newer
      // TS target than this project sets.
      const tones = [...text.matchAll(/<Sla(?:Summary|Stepper)\b[^>]*?tone="(\w+)"/g)].map(
        (m) => m[1],
      );
      if (tones.length === 0) wrong.push(`${site}: no tone passed at all`);
      for (const tone of tones) {
        if (tone !== expected) wrong.push(`${site}: tone="${tone}", ground requires "${expected}"`);
      }
    }
    expect(wrong, "an SLA surface passes the wrong tone for its ground").toEqual([]);
  });
});
