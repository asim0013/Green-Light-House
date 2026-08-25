---
status: final
created: 2026-07-27
updated: 2026-07-27
sources:
  - prds/prd-GLH-2026-07-27/prd.md
  - architecture/architecture-GLH-2026-07-27.md
  - briefs/brief-GLH-2026-06-17/brief.md
---

# GREENLIGHTHOUSE — EXPERIENCE.md

The behavioral contract. Owns **how it works** — information architecture, voice, component behavior, states, interactions, accessibility, and flows. Visual identity lives in `DESIGN.md`; this document references its tokens by name as `{colors.accent}`, `{typography.fontFamily.data}`, etc. On any conflict with a mock or import, **the spines win**; between the two, `DESIGN.md` owns look and `EXPERIENCE.md` owns behavior.

---

## Foundation

- **Form factor:** desktop-first responsive **web**. Primary canvas 1440px; must degrade to tablet and mobile (§ Responsive & Platform). No native app.
- **Platform:** Next.js (App Router, SSR/SSG) + Tailwind + next-intl, per the architecture. SSR/SSG is a hard requirement so per-language content is crawlable (PRD NFR4/FR42). **No third-party UI system** — components are custom; `DESIGN.md` is the sole visual reference.
- **Languages:** EN / TR / RU, EN as fallback. All three are LTR (no RTL work). Every human-readable string is translatable; machine data (`{typography.fontFamily.data}`) is language-neutral.
- **The product is a Product Intelligence Database.** Catalog, search, cross-references, industry pages, and RFQ pre-fill are all generated from one relational store — the UX must behave correctly when that store is **sparse at launch and fills over time** (§ State Patterns).
- **North star:** qualified project inquiries (RFQs). Every surface is measured by whether it moves a visitor toward a good RFQ or a phone call — never toward a checkout (there is none).

---

## Information Architecture

**Navigation model: industry-led primary, product-category secondary.** The top nav leads with *Industries* and *Projects* (proof), not a product mega-menu. Product categories are reached *through* an industry or through catalog search — they are secondary.

Primary nav: **Industries · Products · Projects · Services · About**, with a persistent EN/TR/RU switcher, phone number, and the navy **Request Project Quote** CTA always present.

Sitemap (built screens in **bold**; ● = designed this cycle, ○ = specified, built later):
- **Home** ● — projects-first landing; proof → inquiry.
- **Industries** → **Industry landing** ● (e.g. Oil & Gas): sector hero, equipment categories (→ filtered catalog), applicable standards, services, featured products, projects, CTA.
- **Products** → **Catalog + search** ● → **Product detail** ● (specs, ungated docs, cross-references, accessories, used-in-projects).
- **Projects** → **Project detail** ● (case study → "I have a similar project" pre-filled RFQ).
- **Services** ○, **About** ○ (spine-only; build from `DESIGN.md` patterns).
- **RFQ / project inquiry** ● — the conversion surface; reachable from every CTA, usually pre-filled.
- **Certificates / Downloads** ○ — ungated document library (phased central page; per-product docs live on product detail now).
- **Admin** → **Inquiries/Leads** ● + Catalog/Projects/Manufacturers/Media/Settings CMS ○ (single operator).

**URL & i18n:** locale-prefixed paths (`/en`, `/tr`, `/ru`); canonical + `hreflang` per language; thin/untranslated pages fall back to EN and are `noindex` until real content exists (PRD DP-13).

**Surface closure:** every locked v1 concept has a landing surface, and every conversion path terminates at the RFQ or the phone number. No stated need is left without a screen; no built screen lacks a job in a journey.

---

## Voice and Tone

Microcopy is **technical, direct, and metric-first** — an engineer talking to an engineer. (Brand personality lives in `DESIGN.md § Brand & Style`.)

- **Reframe "no prices" as an advantage, never an apology.** Say *"No price shown — project-specced quote within 24 h,"* not *"Prices available on request."* The "Why no prices?" card explains: project supply is specced, not shelf-priced.
- **Lead with the SLA, everywhere it's promised:** *"Technical review in 24 h · specced proposal in 3 working days."* Consistent numbers across nav CTA, RFQ, and dark bands.
- **Labels are nouns in the mono voice** (`TECHNICAL SPECIFICATIONS`, `SCOPE OF SUPPLY`, `WHAT WE SUPPLY`). Buttons are imperative verbs (*Request a quote for this product*, *Download datasheet*, *I have a similar project*).
- **Name capability, not clients.** Reference nuclear-grade QA discipline as a proof point; never name the client/project (PRD DP-08).
- **Cross-border is a feature:** name the Türkiye–Russia corridor and customs handling where relevant.
- **Fallback is honest:** untranslated content is marked as shown-in-English, not hidden (UJ3).
- **Consent copy is plain:** what's collected, why, linked policy; and a promise — *we never gate documents or sell data.*

---

## Component Patterns

Behavioral spec; visual spec in `DESIGN.md § Components`.

- **Top nav** — active section reflects the current page (`{colors.ink}` + weight). CTA and phone are always reachable; language switch preserves the current route. *(Currently duplicated per screen — promote to one component.)*
- **Product Card** — thumbnail, manufacturer, title, two spec lines, and a footer with an **ungated "Datasheet ↓"** (downloads immediately, no form) and **"Add to inquiry"** (seeds the RFQ / future BOM list). **Never shows price or an add-to-cart.**
- **Model-number search** (catalog) — primary input accepts a pasted model string; matches within GLH's own catalog first, then surfaces **cross-references/equivalents** (external model → GLH equivalent, tagged Direct/Variant/Alternative). Sparse-data safe: a no-match returns a graceful empty state + "request it anyway" path, never a dead end.
- **Filters** (catalog) — Category / Manufacturer / Certification with live counts; counts reflect the current result set; zero-count facets disabled, not hidden.
- **Ungated document download** — datasheets, certificates, manuals download with no login and no lead form; URLs are stable across file revisions (PRD FR25a). This is a trust commitment, not a lead-capture opportunity.
- **RFQ pre-fill (the doorway)** — "I have a similar project" (project detail) and product/industry CTAs open the RFQ with context pre-populated (industry, equipment categories, sometimes specific models/quantities) and a visible **pre-fill banner** the user can clear. Pre-fill is a starting point, always editable.
- **RFQ form** — two-part (Your project / Your details); equipment as removable chips; optional attachment (PDF/XLSX/DWG ≤15 MB, malware-scanned); explicit consent required to submit. Persist-first: the lead is stored before the confirmation email is queued, so a mail failure never loses a lead.
- **Facts / quote anchor card** — the fixed side card is the persistent conversion anchor on product & project pages; its primary CTA routes to the (pre-filled) RFQ, secondary to phone.
- **Tables** (spec, cross-ref, BOM, leads) — scannable rows; numeric columns right-aligned in `{typography.fontFamily.data}`; header + footer summarize.
- **Status pill** (admin) — encodes lead lifecycle (New/In review/Quoted/Closed) with the status palette; filter tabs mirror the same states with counts.

---

## State Patterns

- **Sparse / structure-first catalog (launch reality).** Every list, grid, and filter must render correctly with few or zero items. Empty catalog → explanatory empty state + "search by model" + RFQ CTA; zero search results → "we may still supply it — request it" doorway. Never a blank page.
- **Localization fallback.** Missing TR/RU strings fall back to EN and are **marked** as shown-in-English (UJ3); layout must tolerate mixed-language content without breaking.
- **Loading.** SSR/SSG means first paint is content, not spinners; client transitions use skeletons that match the hairline card geometry.
- **Form validation.** Inline, on blur and on submit; consent unchecked blocks submit with a clear message (FR44); attachment errors state the limit/type in mono. Errors never clear entered data.
- **RFQ submitted.** Immediate on-screen confirmation with the SLA restated and a reference; confirmation email to sender + notification to GLH; failure of email does not fail the submission (persist-first).
- **Ungated docs.** Available = download; missing/revised = stable URL still resolves to the current version.
- **Thin content (SEO).** Untranslated/empty pages are `noindex` with canonical + `hreflang` until populated (PRD DP-13).
- **Admin live-publish.** Content saved in admin appears on the public site without redeploy (ISR tag revalidation); the operator sees a clear "published/live" state.

---

## Interaction Primitives

- **Link & CTA affordance:** links and inline CTAs are `{colors.accent}` + `arrow-right`; primary actions are filled navy (or white-on-dark); one primary per view.
- **Hover/focus:** subtle — border or fill shift within the flat system; **focus is always visible** (see Accessibility). No motion-heavy affordances.
- **The doorway interaction:** clicking a project/product/industry CTA carries context into the RFQ and shows the clearable pre-fill banner — the single most important interaction on the site.
- **Language switch:** instant, route-preserving; sets the locale cookie and updates `hreflang`-linked URL.
- **Phone as co-equal action:** the phone number is a first-class, tappable action everywhere the RFQ CTA appears (validates UJ2).
- **Keyboard:** all actions reachable and operable by keyboard; tables and filters are navigable; modal/dropdown focus is trapped and restored.

---

## Accessibility Floor

Target **WCAG 2.1 AA**.

- **Contrast — known items to verify/fix:**
  - `{colors.ink}`, `{colors.ink-2}` on `{colors.surface}` pass AA for body. ✅
  - `{colors.muted}` (#8A93A0) on `{colors.surface}` is ~3:1 — **fails AA for normal text.** Restrict `muted` to large text (≥18.66px/700 or ≥24px) and genuinely non-essential meta; where small `muted` labels carry meaning, darken toward `ink-2`. **[VERIFY at build.]**
  - `{colors.accent}` navy on white and white on `{colors.accent}` / on `{colors.ink}` bands pass comfortably. ✅
  - On-dark: `on-dark-text` and `accent-soft` on `{colors.ink}` — **verify AA**; `accent-soft` kickers are small, so confirm ratio or enlarge.
- **Focus:** visible focus indicator on every interactive element (do not rely on color alone; use an outline).
- **Semantics:** one `h1` per page; sections use real headings; tables use header cells; forms use associated `<label>`s; icons that carry meaning have text or `aria-label`, decorative icons are hidden.
- **Status is never color-only:** lead status and cross-ref match type pair the color with a text label.
- **Product imagery:** real photos (replacing the icon placeholders) require meaningful `alt`; datasheet links state format + size in text.
- **Forms:** errors announced and associated with fields; consent is an explicit, labeled control.
- **Language:** correct `lang` per locale; fallback content marked so screen readers/users aren't misled.

---

## Key Flows

Named protagonists mirror PRD UJ1–UJ4. Each has a climax beat (**bold**).

**Flow 1 — Elena, procurement engineer at an EPC contractor (UJ1, primary).**
Elena arrives from search shortlisting a fire-suppression package for an oil & gas project. The **Home** page shows her a *delivered* fire-suppression project, not a product grid; she opens the **Project detail** case study, reads the outcome and scope-of-supply BOM, and downloads a certificate with no form. Reassured on nuclear-grade QA capability, she clicks **"I have a similar project."** **Climax: the RFQ opens pre-filled with Oil & Gas + fire-suppression and a clearable banner** — she adjusts quantities, attaches a spec file, checks consent, and submits. She sees the 24 h / 3-day SLA and a reference. *Lands: a qualified RFQ; GLH is shortlisted.*

**Flow 2 — Mehmet, procurement lead at a Turkish manufacturer (UJ2, primary; validates co-equal phone).**
Mehmet needs a specific valve series fast and is browsing in Turkish. On **Catalog** he pastes a model number; **the search returns GLH's equivalent** (cross-reference), he opens **Product detail** and **downloads the datasheet with no form**. **Climax: he taps the phone number — first-class, in his language — and calls within a minute.** *Lands: a phone inquiry; reliability gauged in under a minute.*

**Flow 3 — Dmitry, distributor in Russia (UJ3; validates localization fallback).**
Dmitry enters through **Industries** in Russian for his sector. On the **Industry landing** he browses equipment categories and standards; **some product descriptions aren't translated and fall back to English, clearly marked as such** — nothing breaks. He gathers datasheets and opens the **RFQ**. **Climax: he submits a moderate inquiry despite partial translation, trust intact.** *Lands: an inquiry; graceful fallback held.*

**Flow 4 — Aylin, GLH administrator (UJ4; internal operator).**
Aylin opens the **Admin**, adds a new project and three products, entering EN/TR/RU in tabs and uploading photos; **content appears live without a redeploy.** Next morning she opens the **Inquiries** list, reads Elena's RFQ, moves it through the status pills, and **exports the month's leads to CSV.** *Lands: content maintained and leads actioned by one non-technical operator.*

---

## Inspiration & Anti-patterns

- **Floor to surpass:** `pdlworld.com` (PDL Group, Baku) — same domain, dated. GLH must clearly beat it on modernity, clarity, and technical credibility; it is the floor, not the target.
- **Borrow from:** well-set manufacturer datasheets and technical distributor catalogs (dense, scannable, mono data); premium B2B engineering sites that use dark authority bands sparingly.
- **Anti-patterns (avoid):**
  - Any e-commerce affordance — cart, price, "add to basket," checkout. This is an inquiry platform.
  - Generic SaaS-marketing look (soft gradients, rounded cards, pastel illustrations, hero stock photos of handshakes).
  - Lead-gating documents. Datasheets and certs are ungated on principle.
  - Green as an action color; navy buttons on dark bands.
  - Boxing every element; decorative dividers with no structural purpose.

---

## Responsive & Platform

Desktop-first (1440), but the layout must reflow:
- **Two-column patterns collapse to single column** at tablet/mobile: quote/facts cards move **below** the primary content but keep a **sticky bottom CTA bar** (Request quote / Call) so conversion stays one tap away.
- **Top nav collapses** to a hamburger; the language switcher, phone, and RFQ CTA remain reachable (CTA and phone promoted in the mobile menu header).
- **Grids** (category, product, project) go 3-col → 2-col → 1-col; the 100px gutter shrinks proportionally.
- **Tables** (specs, cross-ref, BOM, leads) scroll horizontally within their own container, or restack as label/value pairs on mobile — never force the page to scroll sideways.
- **Dark bands** keep their role but stack their two columns; CTA buttons go full-width.
- **Touch targets** ≥44px; the co-equal phone action becomes a tel: tap.
- **Admin** is desktop-oriented but must remain usable on a tablet for on-the-go lead review.
