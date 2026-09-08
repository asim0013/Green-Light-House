---
status: final
created: 2026-07-27
updated: 2026-07-27
sources:
  - prds/prd-GLH-2026-07-27/prd.md
  - briefs/brief-GLH-2026-06-17/brief.md
  - architecture/architecture-GLH-2026-07-27.md
tokens:
  colors:
    surface: "#FFFFFF"        # page background
    surface-2: "#F5F7FA"      # inset panels, thumbnails, table headers, chips
    ink: "#14181F"            # primary text; also the dark credibility bands
    ink-2: "#5A6470"          # secondary text, body copy
    muted: "#8A93A0"          # tertiary labels, meta, placeholder (LARGE / non-essential only)
    accent: "#0E2F57"         # deep navy — primary CTAs, links, emphasis, active nav
    accent-soft: "#5C86B5"    # steel — kickers on dark, secondary data accent
    brand: "#159A5B"          # green — LOGO MARK ONLY + "new/success" status
    border-subtle: "#E6E9EE"  # hairlines, card/table borders
    # On-dark helpers (used only inside ink #14181F bands/panels)
    on-dark-text: "#C2C9D2"   # body copy on dark
    on-dark-border: "#2A3340" # hairlines on dark
    on-dark-panel: "#1B222E"  # raised panel on a dark band
    # Status palette (admin leads + product availability)
    status-new: "#159A5B"     # green
    status-review: "#C2870B"  # amber
    status-quoted: "#0E2F57"  # navy (= accent)
    status-closed: "#8A93A0"  # muted
    error: "#B42318"          # form validation — error text + invalid-control borders (Story 3.2; 4.5:1+ on surface AND surface-2)
  typography:
    fontFamily:
      heading: "Geist"          # headings, card/section titles
      body: "Inter"             # body copy, UI labels, buttons (full TR + Cyrillic coverage)
      mono: "Geist Mono"        # kickers, eyebrow labels, table headers, chips (UPPERCASE + tracking)
      data: "IBM Plex Mono"     # model numbers, specs, quantities, dates, refs, phone
    scale:
      display: 40-46            # industry/project hero H1
      h1: 34-40                 # page H1
      h2: 24-28                 # section titles
      h3: 16-18                 # card/subsection titles
      body: 14-17
      small: 12-13
      kicker: 11                # mono, letter-spacing 1.5-2, uppercase
      micro: 10-11              # mono chips, table headers
    weights: { heading: 700, title: 600, body: 400, label: 600 }
    letterSpacing: { display: -1, h1: -0.5, kicker: 1.5, mono-chip: 1 }
  rounded:
    default: 0                  # SHARP corners everywhere — no border-radius
  spacing:
    base: 4
    section-padding-y: 44-64
    gutter-x: 100               # desktop horizontal page margin
    content-max: 1240           # inner content width at 1440 canvas
    card-padding: 18-24
    grid-gap: 20
  components:
    surfaceStyle: flat          # no shadows; depth via hairlines + dark bands
    borderWidth: 1              # hairline; 1.5 for emphasized outline buttons
    iconLibrary: lucide         # line icons, ~stroke default
---

# GREENLIGHTHOUSE — DESIGN.md

The visual identity contract. Owns **how it looks**. On any conflict with a Pencil mock, wireframe, or import, **this document wins**. Behavioral concerns (IA, states, flows) live in `EXPERIENCE.md`, which references these tokens by name.

Design artifacts (source of truth for layout) — **in-repo** (durability caveat below):

- `imports/glh-canvas-recovered.pen.json` — the Pencil canvas, 7 screens + the Product Card component.
- `imports/glh-canvas-outline.md` — generated readable outline, one section per frame. Start here.
- `imports/glh-canvas-reconciliation-data.json` + [`MOCK-RECONCILIATION.md`](MOCK-RECONCILIATION.md) — how the shipped UI differs from the canvas, per surface, with verdicts.

Decisions and their rationale: `.decision-log.md`.

> **These paths are tracked in git.** `_bmad-output/` is otherwise gitignored; `.gitignore` carries an explicit exception for `planning-artifacts/ux-designs/` so the design source is versioned with the code it governs.
>
> **This line previously named a Pencil `.pen` path.** That path was machine-local and tool-internal, the rename it instructed was never carried out, and the export step that would have made it portable was skipped — so the canvas survived only as a content-addressed backup blob named by its hash, findable by no search. Five Epic 2 story records checked the named path, found nothing, and concluded "there is no mock"; four surfaces were then designed at dev-kickoff from prose while their frames sat one directory outside the repo. Recovered 2026-08-25. **Never point this line at anything outside the repository again.**

---

## Brand & Style

**Archetype: engineering / technical-precise.** GREENLIGHTHOUSE sells credibility, not flash. The site is a supplier's technical instrument — it reads like a well-set datasheet, not a marketing landing page. Every screen is built to make a procurement engineer trust that this company can spec, certify and deliver hazardous-area equipment on a fixed date.

Principles:
- **Proof over promise.** Delivered projects, real specs, real certificates, visible SLAs — shown, not claimed.
- **Precision as aesthetic.** Sharp corners, hairline rules, monospaced data, generous whitespace, restrained color. Nothing decorative earns its place unless it aids comprehension.
- **No prices, no cart — reframed as speed.** The absence of prices is presented as an advantage: an accurate, specced quote fast, not list prices to chase. The site never apes an e-commerce store.
- **Quiet green, confident navy.** Green is the brand's signal, reserved almost entirely for the mark. Deep navy carries every action.
- **Dark bands = authority.** Ink-colored full-bleed bands mark the credibility and conversion beats (stats, SLAs, closing CTAs).

Voice in the visual layer is terse and technical: UPPERCASE mono kickers, model numbers in data-mono, metric-first stats. (Microcopy voice lives in `EXPERIENCE.md § Voice and Tone`.)

---

## Colors

| Token | Hex | Role |
|---|---|---|
| `surface` | `#FFFFFF` | Page background |
| `surface-2` | `#F5F7FA` | Inset panels, thumbnails, table header rows, chips |
| `ink` | `#14181F` | Primary text **and** the dark credibility/CTA bands |
| `ink-2` | `#5A6470` | Body copy, secondary text |
| `muted` | `#8A93A0` | Tertiary labels, meta, placeholders |
| `accent` | `#0E2F57` | **Primary CTAs, links, emphasis, active nav** |
| `accent-soft` | `#5C86B5` | Steel — kickers on dark bands, secondary data accent |
| `brand` | `#159A5B` | **Logo mark only** + "new/success" status dot |
| `border-subtle` | `#E6E9EE` | All hairlines, card & table borders |

**On-dark set** (only inside `ink` bands/panels): `on-dark-text #C2C9D2` (body), `on-dark-border #2A3340` (hairlines/dividers), `on-dark-panel #1B222E` (raised panel, e.g. the industry "Typical applications" list). Kickers on dark use `accent-soft`; headings on dark use pure `#FFFFFF`.

**Status palette** (admin leads, availability): New = `status-new` green, In review = `status-review` amber, Quoted = `status-quoted` navy, Closed = `status-closed` muted.

**Error** (added by Story 3.2 — no error colour existed and `status-review` amber measures 3.10:1, an AA failure for error text): `error #B42318`, ≥4.5:1 on `surface` and `surface-2`. Use for form error text and invalid-control borders only; the error MESSAGE is the non-colour cue, and the colour is never a button or emphasis treatment.

Usage rules:
- **Green is sacred to the brand mark.** Do not use green for buttons, links, or emphasis. Its only non-logo use is the small "new/success" status dot and the cert `badge-check` glyph.
- **Navy is the single action color.** Every primary CTA, text link, active state and emphasized value is `accent`.
- **Dark CTAs invert.** On an `ink` band, the primary button is `surface` (white) with `ink` text; the secondary is a `#FFFFFF` hairline outline with white label. Never place a navy button on the ink band (too low-contrast).
- **`muted` is for non-essential text only** — see § Accessibility notes in `EXPERIENCE.md`; do not set essential body copy in `muted` on `surface`.

---

## Typography

Four families, each with a strict role — the split between the two monospaces is deliberate and load-bearing:

- **Geist** (`heading`) — 700, tight tracking (−0.5 to −1 at display sizes). All headings and card/section titles.
- **Inter** (`body`) — 400 body / 600 labels & buttons. Chosen for full Turkish + Cyrillic coverage (EN/TR/RU).
- **Geist Mono** (`mono`) — UPPERCASE **kickers, eyebrow labels, table headers, chips**, letter-spacing 1–2. This is "the label voice."
- **IBM Plex Mono** (`data`) — **machine data**: model numbers (`FD-9500`), spec values (`−55 … +85 °C`), quantities, dates, lead refs, phone numbers, stat figures. This is "the data voice."

Scale: display 40–46 (industry/project hero) · h1 34–40 (page) · h2 24–28 (section) · h3 16–18 (card/title) · body 14–17 · small 12–13 · kicker 11 · micro 10–11.

Rule of thumb: **if it's a number a machine produced, it's `data` mono; if it's a category label a human wrote, it's `mono`; if it's a sentence, it's `body`; if it's a title, it's `heading`.**

---

## Layout & Spacing

- **Desktop-first, 1440px canvas.** Horizontal page gutter is **100px**; inner content width **≈1240px**. (Responsive behavior → `EXPERIENCE.md § Responsive & Platform`.)
- **Vertical rhythm by full-bleed sections.** The page is a stack of full-width section frames (`padding: [44–64, 100]`), each separated by a top hairline (`border-subtle`) or a change of `fill` (`surface` ↔ `surface-2` ↔ `ink`).
- **Two-column pattern (verified):** a `fill_container` main column beside a **fixed-width** side column (e.g. quote box 420, facts card 380, RFQ sidebar 360, applications panel 420, CTA button column 320). This — never `space_between` + an `end`-aligned/fit-content child — is the canonical way to push a side element to the right edge. (See § Do's & Don'ts and the layout note in `.decision-log.md`.)
- **Grids** are explicit row frames of `fill_container` cells with `gap: 20`; there is no auto-wrap.
- **Section-header pattern:** left title block (mono kicker + Geist h2 + optional sub) with an optional right-aligned link (`space_between` is safe here because both children are fit-content).

---

## Elevation & Depth

**Flat. No shadows.** Depth is expressed three ways only:
1. **Hairline borders** (`1px border-subtle`) around cards, tables, thumbnails, chips.
2. **Surface steps** — `surface` → `surface-2` for inset/secondary regions.
3. **Dark bands** — full-bleed `ink` sections for the credibility and conversion beats; on dark, hairlines become `on-dark-border` and raised panels use `on-dark-panel`.

Outline buttons use a slightly heavier `1.5px` stroke for tap-target clarity.

---

## Shapes

- **Sharp corners everywhere.** `rounded.default = 0`. No border-radius on buttons, cards, chips, inputs, thumbnails, or pills. (Status "pills" are rectangular tags, not rounded.)
- **Hairline strokes**, `strokeAlignment: inner`, so borders never inflate layout.
- **Icons:** `lucide` line icons at 13–46px. Product/category thumbnails are a `surface-2` box with a centered line icon (stand-in for real product photography). Cert marks use `badge-check` in `brand` green.

---

## Components

Visual specs; behavior in `EXPERIENCE.md § Component Patterns`.

- **Top nav** — `surface`, bottom hairline, `padding [20,100]`. Left: green mark (`brand` 26px box, white "G") + `GREENLIGHTHOUSE` wordmark (Geist 700). Center: industry-led links (Inter 14, `ink-2`; active = `ink` + 600). Right: EN/TR/RU switcher (mono 12), phone (data mono), navy "Request Project Quote" CTA. *(Currently copied per-screen; promote to one component — see open items.)*
- **Breadcrumb** — `surface-2` strip, bottom hairline, `padding [14,100]`, mono 12; trail in `muted`, current page `ink`, separators `border-subtle`.
- **Buttons** — Primary: `accent` fill, white 15/600 label, `padding [13,20]`, sharp. Secondary: `surface` + `ink` 1.5 hairline. On-dark primary: `surface` fill + `ink` label. On-dark secondary: white hairline + white label. Text link/CTA-inline: `accent` 13–14/600 + `arrow-right`.
- **Product Card** (`gf9DY`, reusable) — `surface`, 1px border. Thumb (`surface-2`, 140h, centered line icon, bottom hairline) → body (mono MANUFACTURER, Geist title, spec rows) → footer (Datasheet ↓ ungated link + "Add to inquiry" outline). **No price anywhere.**
- **Quote / facts anchor card** — fixed-width side card, 1px border, header hairline; label/value rows; footer block (hairline top) with primary + secondary CTA + mono trust line.
- **Spec / data rows** — `label` (Inter 13, `ink-2`) left, `value` (data mono 13, `ink`) right, bottom hairline. Grouped under mono group titles.
- **Tables** — frame → row → cell (frame) → content. Header row `surface-2` + bottom hairline, mono **`ink-2`** headers; body rows white with bottom hairlines; numeric columns right-justified; footer row `surface-2`. **Shipped as `src/components/projects/ProjectBomTable.tsx` (Story 3.1b) — the canonical table; Epic 4's Admin Inquiries table inherits it.**

  > ⛔ **THE HEADER TOKEN WAS `muted` UNTIL STORY 3.1b, AND IT WAS A WCAG 1.4.3 FAILURE.** This line prescribes a `surface-2` header row, and line 44 of this document puts table headers at `micro: 10-11` — small text, so the large-text exemption does not apply. `muted` (#8A93A0) measures **2.89:1 on `surface-2`**; AA needs 4.5:1. `ink-2` (#5A6470) measures **5.60:1**. The ratios are computed in `src/components/ui/Kicker.tsx:14-27`, whose own docstring already concluded that `muted` "fails on both light surfaces … retained only for the dark band". Story 3.1 made exactly this correction on the project page (`ProjectMediaBand`, `IndustrySection`); implementing this line literally would have shipped the failure into the component Epic 4 inherits.
- **Chips / badges** — rectangular, `surface-2` fill or 1px border, mono 10–11. Cert chip adds green `badge-check`.
- **Status pill** — rectangular tag, colored per status palette (text + small dot / tinted).
- **Kicker** — mono 11, `accent-soft` (on dark) or `accent-soft`/`muted` (on light), letter-spacing 1.5, UPPERCASE, above section h2.
- **Dark band** — full-bleed `ink`; used for stat bands, SLA steppers, and closing CTAs; content follows the fill+fixed two-column pattern.
- **Form field** — label (Inter 13/600) + control with 1px border, sharp; selects, chips-input (removable equipment chips), textarea, file dropzone (dashed hairline + constraints in mono). Consent checkbox references Privacy Policy.
- **Admin app shell** — dark `ink` sidebar (244px) with green mark, nav w/ active = `#1E2A3A` fill + `accent-soft` left bar; light main region with topbar, status tabs, and leads table.

---

## Do's and Don'ts

**Do**
- Reserve `brand` green for the logo mark and the new/success dot.
- Route every action through `accent` navy (light surfaces) or white (dark bands).
- Use `data` mono for anything a machine emitted (models, specs, quantities, dates, refs).
- Separate sections with a hairline or a `fill` change; keep the 100px gutter.
- Push side elements right with `fill_container` main + fixed-width side column.
- Keep corners sharp and depth flat; let hairlines and dark bands do the work.

**Don't**
- Don't use green for buttons/links, or a navy button on a dark band.
- Don't introduce shadows, gradients, or rounded corners.
- Don't set essential body text in `muted` on white (contrast — see EXPERIENCE.md).
- Don't use `space_between` + an `end`-aligned or fit-content child to right-align (the layout engine mis-resolves it — overflow).
- Don't show a price, a cart, an "add to basket," or any e-commerce affordance.
- Don't wrap every element in its own box; use a container only when it has structural purpose.
