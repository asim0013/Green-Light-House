/**
 * The legal-pages publication gates (Story 5.1 — FR43).
 *
 * `/privacy`, `/terms` and `/cookies` ship REAL drafted copy and render
 * unconditionally — the RFQ consent row links `/privacy` and the footer links
 * all three on every page, so none of them may 404. What is gated is whether a
 * search engine is told about them.
 *
 * ⚠️ BOTH GATES HERE CONTROL INDEXING ONLY, NEVER RENDERING — AND THAT DIFFERS
 * FROM `/contact` ON PURPOSE. On `/contact`, `approvals.legalReviewed` gates the
 * RENDER of the реквизиты block, because publishing unreviewed company
 * registration details is itself harmful and `noindex` does not withhold a
 * footer-linked disclosure. The legal PAGES are policy TEXT that MUST stay
 * reachable (the consent link depends on `/privacy` resolving) and whose honest
 * current draft is not harmful to show — it is only not yet fit to ADVERTISE.
 * So both gates fold into `legalSignals`' `isPlaceholder` and act on the
 * index/sitemap decision alone. Do not "fix" this to match `/contact`.
 *
 * ⚠️ A BOOLEAN, NOT A DATE OR A NAME (the `ContactApprovals` reasoning). The
 * only question either gate answers is "may these be advertised"; who reviewed
 * and when belongs in the commit that flips it. Both default `false` — fail
 * closed: the pages are born `noindex` and lift themselves once a human ticks
 * both, with no code change (exactly as `/contact` and the `/privacy` stub do).
 */
export interface LegalApprovals {
  /**
   * Has the legal copy (the Terms especially, and the privacy policy's
   * data-handling claims) passed qualified legal review? `prd.md:186` (DP-10,
   * OQ7) requires qualified legal review before launch.
   */
  legalReviewed: boolean;
  /**
   * Has a native speaker reviewed the Turkish and Russian legal copy? The TR/RU
   * strings are machine-drafted (disclosed as such); `owner-actions.md` §3
   * requires native review before the copy is advertised to search engines.
   */
  translationsReviewed: boolean;
}

export interface LegalContent {
  approvals: LegalApprovals;
}

/**
 * ⚠️ BOTH DEFAULT `false` UNTIL A HUMAN FLIPS THEM — see
 * `_bmad-output/implementation-artifacts/GLH/owner-actions.md` §0 (GO-LIVE) and
 * §3 (translation review). The pages, the predicate and the sitemap gate are
 * built and working; nothing here awaits code.
 */
export const LEGAL: LegalContent = {
  approvals: {
    legalReviewed: false,
    translationsReviewed: false,
  },
};

/**
 * The effective-period label for the TERMS page's date line.
 *
 * ⚠️ NOT the consent stamp. The privacy policy's version line is
 * `PRIVACY_POLICY_VERSION` (`@/server/rfq/schema`), which `Lead.consentVersion`
 * cites and which must bump on any privacy-copy change. Terms carry no consent
 * relationship, so they show this plain period instead — kept separate so a Terms
 * wording tweak can never move the consent stamp.
 *
 * (Until Story 5.8 this also dated the Cookie Policy. It no longer does — see
 * `COOKIES_EFFECTIVE`: the cookie copy changed substantively twice in October and
 * a shared month label could not show that.)
 */
export const LEGAL_EFFECTIVE = "2026-10";

/**
 * The COOKIE POLICY's own effective date (Story 5.8 review F7). Day-granular,
 * because its copy changed substantively twice in one month — Story 5.2 (the
 * consent cookie) and Story 5.8 (the cookieless analytics + the opt-out flag).
 */
export const COOKIES_EFFECTIVE = "2026-10-05";

/**
 * sha256 of `JSON.stringify(en.Legal.cookies)` — the EN-canonical cookie copy that
 * `COOKIES_EFFECTIVE` dates. `legal.test.ts` recomputes it and FAILS when the copy
 * changes, so a substantive edit cannot ship under a stale effective date: whoever
 * edits the copy must advance `COOKIES_EFFECTIVE` (if the change is substantive)
 * and re-record this value, deliberately. (EN only: TR/RU translate it and sit
 * behind `translationsReviewed`.)
 */
export const COOKIES_COPY_FINGERPRINT =
  "3c4cf34126ac72a262bc14cc8b1d81cd8e8e0e1e46d809e7b0f7567b125f3d65";
