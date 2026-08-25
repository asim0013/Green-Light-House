# Pencil canvas — recovery and reconciliation

**Date:** 2026-08-25 · **Trigger:** Epic 2 retrospective, decision **D4** · **Status:** recovered, reconciled, spines patched

> ✅ **Durability solved — see §6.** `.gitignore` now carries an explicit exception so the UX design source is **tracked and versioned**, while the rest of `_bmad-output/` stays local-only as before.
>
> **Artifacts, all now in `imports/`:**
> - `glh-canvas-recovered.pen.json` — the canvas itself (~478KB; document token stripped on recovery)
> - `glh-canvas-outline.md` — generated readable outline, one section per frame (~160KB)
> - `glh-canvas-reconciliation-data.json` — the full structured reconciliation (~292KB): every divergence with mock evidence, `file:line` of the shipped code, verdict, rationale and action, plus three implementation briefs
>
> This document is the curated summary. The JSON is the register.

---

## 1. What was recovered

The `.pen` file named by DESIGN.md:65 does not exist and never will. The canvas survived as a **plaintext JSON backup** at `C:/Users/user/.pencil/backup/ea3399bd07d15d2f43d0046e93e473f138ecd474` (682,566 bytes, mtime 2026-07-31), one of five blobs in that directory. Two are empty stubs, one is a HeroUI template, and one 1MB blob is a **different project's** canvas (LogiSupp — "Marketing — Home", "Admin — Dashboard & Leads"). Exactly one is GREENLIGHTHOUSE.

It holds **8 frames**, matching DESIGN.md:65 exactly:

| Frame | Status |
|---|---|
| Home — Desktop | built (1.7) |
| Industry — Desktop | built (2.1) |
| Products — Desktop | built (2.2 / 2.5) |
| component/Product Card | built (2.1–2.5) |
| Product Detail — Desktop | built (2.4) |
| **RFQ — Desktop** | **unbuilt — Story 3.2** |
| **Project Detail — Desktop** | **unbuilt — Story 3.1** |
| **Admin — Inquiries** | **unbuilt — Story 4.7** |

There is **no Services frame and no About frame**. Story 2.6 was therefore correct to build `/services` from spine patterns — it is the one Epic 2 story whose "no mock" claim was true.

---

## 2. The root cause — narrower and more interesting than the retrospective assumed

The Epic 2 retrospective suggested the spines may have mis-marked surfaces as "spine-only". **They did not.** Checked frame by frame:

- EXPERIENCE.md:33's legend is `● = designed this cycle, ○ = specified, built later`.
- **Every ● surface has a frame. Every ○ surface genuinely has none** (Services, About, Certificates/Downloads, the admin CMS screens, all responsive variants).
- DESIGN.md:65's "7 screens + the Product Card component" is exactly what the canvas holds.
- `.decision-log.md:122`'s own "Mock coverage" line says the same thing.

The ○/● marks were **accurate the whole time**. The real cause is one line:

> **DESIGN.md:65** — "Design artifacts (source of truth for layout): the Pencil canvas `pencil-new.pen` (rename → GREENLIGHTHOUSE) — 7 screens + the Product Card component."

That designates a **machine-local, tool-internal path** as the source of truth for layout, names a file (`pencil-new.pen`) alongside a rename instruction that was never carried out, and the optional export step that would have made it portable was skipped. The canvas then survived only as a **content-addressed blob named by its hash** — so no search by name could ever have found it.

This matters for how the failure is judged. Five story records checked a path that DESIGN.md itself designated as canonical, found nothing, and recorded that. **The verification was not lazy; it was defeated by content-addressed storage.** What was wrong was the *conclusion* — "the path is dead" became "there is no mock" — and the Epic 2 retrospective's lesson stands unchanged: *"verified" is a claim about a conclusion, not about an observation.*

**Fixed as part of this reconciliation:** DESIGN.md:65 now points at the in-repo recovered artifacts.

---

## 3. What the reconciliation found

**90 divergences** across five built surfaces plus the spines:

| Verdict | Count | Meaning |
|---|---|---|
| `MOCK_WINS` | **32** | the build lost something real |
| `SPINE_MUST_UPDATE` | 20 | DESIGN.md / EXPERIENCE.md is now wrong about what exists |
| `ACCEPT_BOTH` | 19 | defensible difference — recorded so nobody "fixes" it |
| `BUILT_WINS` | 19 | the deviation was correct |

Severity: **16 HIGH · 42 MEDIUM · 32 LOW**.

### The token layer never diverged

All 13 canvas variables are **byte-identical** to `src/app/globals.css`: `surface` #FFFFFF · `surface-2` #F5F7FA · `ink` #14181F · `ink-2` #5A6470 · `muted` #8A93A0 · `accent` #0E2F57 · `accent-soft` #5C86B5 · `border-subtle` #E6E9EE · `brand` #159A5B · Geist / Inter / Geist Mono / IBM Plex Mono. Story 1.5's foundation is exactly right.

So is the geometry: the 1440/100/1240 layout frame, all **five** fixed side-column widths at DESIGN.md:129 (quote 420, facts 380, RFQ sidebar 360, applications panel 420, CTA column 320) verify to the pixel, and the spec-row, breadcrumb, admin-shell and nav specs match the canvas attribute for attribute.

**The pattern is clean: everything expressible as a *rule* survived into the spines. Everything expressible only as *drawing* did not.**

### Per surface

| Surface | Divergences | Verdict split | Character of the gap |
|---|---|---|---|
| **Home** | 14 | 6 mock / 3 built / 2 spine / 3 both | Below the nav, a different page — two designed zones (stats band, SLA stepper) never built anywhere |
| **Industry** | 12 | 5 mock / 3 built / 1 spine / 3 both | Skeleton faithful; **density** lost — the mock is a sales document, the build a taxonomy listing |
| **Products** | 16 | 8 mock / 2 built / 2 spine / 4 both | Zone order faithful; search demoted from primary affordance, facet sidebar replaced by chips |
| **Product Card** | 13 | 3 mock / **5 built** / 1 spine / 4 both | Closest match in the recovery — the build legitimately won more often than it lost |
| **Product Detail** | 14 | 8 mock / 2 built / 2 spine / 2 both | Shared skeleton, different documents — mock is nine editorial zones, build is two |
| **Spines** | 21 | — | Skeleton captured precisely, anatomy lost |

**The 4-column regression is genuinely resolved.** The shipped grid is `sm:grid-cols-2 lg:grid-cols-3`, which lands on the mock's 3-per-row *and* satisfies EXPERIENCE.md's 3→2→1 ladder. Nobody should "fix" that back — it is recorded here as `BUILT_WINS` for exactly that reason.

### The 16 HIGH items

Nine are `MOCK_WINS` on built surfaces — real losses, listed in §5. The rest are spine corrections, applied or scheduled below.

**The single most consequential is not visual.** On the homepage, the mock's hero proof card ends in a hairline-topped footer carrying **"I have a similar project →"**. EXPERIENCE.md:97 calls that doorway *"the single most important interaction on the site"*; EXPERIENCE.md:127 makes it the climax of Flow 1. The shipped `ProofCard` (`src/components/home/HomeHero.tsx:93-122`) is a plain `<div>` — **no link anywhere in the card** (verified by hand). The homepage presents its proof above the fold and then gives the persuaded visitor no exit but the generic Request-Quote button, losing the industry/equipment context that makes an RFQ qualified. Nothing in the data or the a11y rules forced this; `project.slug` is resolved and unused. It is an omission in the 1.7 spec that no review could catch, because there was no mock to check against.

---

## 4. The unbuilt surfaces — this is the real yield

Three frames design surfaces that **have not been built yet**, so nothing has been lost and everything can still be gained. The reconciliation turned each into an implementation brief.

| Surface | Story | Zones | Components | Real copy strings | Contradicts the plan in |
|---|---|---|---|---|---|
| **RFQ — Desktop** | 3.2 / 3.4 / 3.7 | 18 | 23 | **27** | 19 places |
| **Project Detail** | 3.1 | 11 | 18 | **29** | 14 places |
| **Admin — Inquiries** | 4.7 | 18 | 18 | 15 | 16 places |

**Epic 3's two surfaces were designed and were about to be invented from prose for a second time.** Recovering them before Story 3.1 is the whole return on this exercise.

The `contradicts_plan` entries are the sharpest part, because they surface schema and requirement gaps *now* rather than mid-story. A sample, each verified against the repo:

- **RFQ page ground is inverted** — the frame fill is `surface-2`, not `surface`, the only page on the site built that way. It is what makes the white form cards read as cards.
- **The RFQ has no route in the architecture.** `architecture-GLH-2026-07-27.md:163-167` enumerates the public routes and `/rfq` is not among them — while `SITE.rfqHref` has shipped in every CTA since Story 1.6.
- **Quantities are required by FR27 and Story 3.2's first AC, have a `quantities` column, and are absent from the mock.** The mock also invents a **TIMELINE** field with no FR and no column.
- **Project Detail's BOM has quantities and a "317 units total" footer; `ProjectProduct` is a bare join** — no quantity, no sort order. And one BOM row has an em-dash manufacturer, so it is not a catalog product at all: a read driven purely off `ProjectProduct` cannot render it.
- **Four of the six Project Facts rows have nowhere to live** — `Project` has slug/industry/status/media/deliveredAt; CLIENT, LOCATION, SCOPE and LEAD TIME have no column.
- **Admin's most prominent column is a human-readable reference (`GLH-RFQ-2041`)** that no schema, FR or story defines — `Lead` has only a cuid.
- **FR45 requires lead deletion for erasure; the admin frame has no delete affordance at all.** FR36a requires "all captured fields"; the mock's table shows six.

---

## 5. What happens next

### Applied now

- **DESIGN.md:65 repointed** at the in-repo recovered artifacts. This is the root cause and it is closed.
- The canvas, its outline, and the full reconciliation register are **in the repo and versioned**.

### Scheduled, not done here

Reconciliation produces the record; it does not rebuild the UI. The **32 `MOCK_WINS` items are a backlog, not this task.** They live in `glh-canvas-reconciliation-data.json` with a concrete `action` each. Per the Epic 2 retrospective's action **P6**, they are *not* being poured into `deferred-work.md` — that ledger is append-only with 67 unclosed entries. One pointer entry references this register instead.

**Recommended sequencing:**

1. **Before Story 3.1 and 3.2** — read the two Epic 3 briefs. This is time-critical: those stories are next, and the briefs carry 56 real copy strings and 33 schema/requirement contradictions that would otherwise be discovered mid-implementation.
2. **The nine HIGH `MOCK_WINS` on built surfaces** — schedule as a UI-fidelity pass. The homepage doorway CTA is the one with a business consequence rather than a visual one, and it is small.
3. **The 20 `SPINE_MUST_UPDATE` items** — fold into the spines when each surface is next touched, so the documents stop drifting further.
4. **Before Epic 4** — read the Admin brief and settle the reference-number, delete-affordance and field-coverage gaps it exposes.

---

## 6. Durability — solved

The recovery initially left the canvas **untracked**: `_bmad-output/` is gitignored, so a fresh clone would have got a DESIGN.md pointing at four files that were not there. That is the same failure one step less severe — the canvas would have moved from *machine-local, hash-named, findable by nobody* to *project-local, meaningfully named, findable by anyone with this working tree*, but still not to *durable*.

**`.gitignore` now carries an explicit exception and the design source is committed.** Git cannot re-include a path whose parent directory is excluded, so each level is re-included and then re-emptied in turn:

```
!/_bmad-output/
/_bmad-output/*
!/_bmad-output/planning-artifacts/
/_bmad-output/planning-artifacts/*
!/_bmad-output/planning-artifacts/ux-designs/
```

**Tracked (8 files, ~993KB):** both `.decision-log.md` files, `DESIGN.md`, `EXPERIENCE.md`, this document, and the three `imports/` artifacts.

**Unchanged:** everything else under `_bmad-output/` — implementation artifacts, story files, `deferred-work.md`, the epics, the PRD and the architecture — remains local-only, along with `_bmad/` and `.claude/`. Verified per-path with `git check-ignore`.

The design source is now versioned alongside the code it governs, which also puts it under the same review discipline. **DESIGN.md's "source of truth for layout" must never again point outside the repository.**

### Two corrections this exercise made to the Epic 2 retrospective

Both are recorded here rather than silently:

1. The retrospective implied EXPERIENCE.md may have mis-marked designed surfaces as spine-only. **It did not** — the ○/● marks are accurate throughout. The root cause is DESIGN.md:65's machine-local pointer.
2. The retrospective treated "the design source was missing" as uniform across Epic 2. **Story 2.6 is the exception** — there is genuinely no Services frame, so its spine-only build was correct.
