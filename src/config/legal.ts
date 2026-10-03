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
 * The effective-period label for the Terms and Cookie pages' date line.
 *
 * ⚠️ NOT the consent stamp. The privacy policy's version line is
 * `PRIVACY_POLICY_VERSION` (`@/server/rfq/schema`), which `Lead.consentVersion`
 * cites and which must bump on any privacy-copy change. Terms and Cookies carry
 * no consent relationship, so they show this plain period instead — kept
 * separate so a Terms wording tweak can never move the consent stamp.
 */
export const LEGAL_EFFECTIVE = "2026-10";
