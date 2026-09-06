/**
 * The contact CHANNELS — values only, never copy (Story 3.8 — FR33).
 *
 * ⚠️ VALUES LIVE HERE, LABELS LIVE IN `messages/`. The three language versions
 * must not be able to state different registration numbers, so nothing in this
 * file is translatable and nothing translatable is in this file. `Footer.city`
 * is the deliberate counter-example and stays where it is: it renders
 * İstanbul / İstanbul / Стамбул, so it is a translated place NAME, not an
 * address value.
 *
 * ⚠️ `null` IS THE ONLY MARKER FOR "NOT SUPPLIED". No sentinel strings, no
 * placeholder values, no `TODO` text to pattern-match. A channel is configured
 * iff its value is non-null and non-blank; everything downstream — what renders,
 * what `contactSignals` counts, whether the page is indexable — follows from
 * that one rule. A sentinel string would have to be recognised in three places
 * and would eventually be rendered to a buyer by the one that forgot.
 *
 * ⚠️ THE PHONE IS NOT HERE, DELIBERATELY. `SITE.phone`/`SITE.phoneDisplay`
 * (`src/config/site.ts`) already serve fifteen `tel:` sites — the header on
 * every page, the hero, every industry and project page, `/services`, the RFQ
 * rail and the 404. Moving it would be a fifteen-consumer refactor inside a page
 * story. /contact renders it through the shared `TalkCard` as CHROME, exempt
 * from the configured-channels rule, showing exactly what every other page
 * already shows.
 *
 * ⛔ NO BANK DETAILS, EVER. The requirement was written as "реквизиты", whose
 * literal reading includes them. Publishing bank details on a public page is a
 * payment-fraud surface; if GLH wants them shown that needs its own decision.
 */

/** A legal-details block. Turkish field set — the entity is registered in Türkiye. */
export interface ContactLegal {
  /** Ticaret unvanı. The block's ANCHOR: without it the rest is unattributable. */
  legalName: string | null;
  /** Ticaret sicil no. */
  tradeRegistryNo: string | null;
  /** Vergi dairesi. */
  taxOffice: string | null;
  /** Vergi kimlik no. */
  taxNo: string | null;
  /** MERSIS no. */
  mersisNo: string | null;
}

/**
 * The HUMAN GATES that stand between supplied values and a published page.
 *
 * ⚠️ THESE EXIST BECAUSE THE 3.8 REVIEW FOUND THAT NOTHING COULD SEE THEM. Two
 * pre-launch obligations were written down in the planning record and neither
 * was reachable from any predicate, any test or any gate: filling five values in
 * this file flipped `/en/contact`, `/tr/contact` AND `/ru/contact` to
 * `index, follow` and into `sitemap.xml` on the next deploy — measured live —
 * with nothing failing and nothing warning. Both obligations are now booleans a
 * human must set deliberately, in the same file and the same edit as the values
 * they govern.
 *
 * ⚠️ A BOOLEAN, NOT A DATE OR A NAME. The only question either gate has to
 * answer is "may this be published"; anything richer invites a half-filled
 * record that reads as approval. Who approved and when belongs in the commit
 * that flips it.
 */
export interface ContactApprovals {
  /**
   * Has the legal-details block passed qualified legal review?
   *
   * ⛔ GATES RENDERING, NOT MERELY INDEXING — and that is the point. A `noindex`
   * page is still public and still footer-linked, so `noindex` is no protection
   * at all for a disclosure obligation. `prd.md:186` (DP-10, OQ7) requires
   * "qualified legal review before launch", and the sprint change proposal that
   * created this story's scope names the реквизиты block as exactly that class
   * of content. Until this is `true` the block does not render, however complete
   * its values are.
   */
  legalReviewed: boolean;
  /**
   * Has a native speaker reviewed the Turkish and Russian page copy?
   *
   * ⛔ GATES INDEXING. `owner-actions.md` §3(b) requires this review "before the
   * page is indexed" — that is the obligation's own wording, so this gate sits
   * exactly where its source puts it, on the index/sitemap decision rather than
   * on the render. The `Contact` namespace's 28 TR/RU strings are
   * machine-drafted; the page is reachable and useful before they are reviewed,
   * but it must not be advertised to search engines in a language nobody has
   * read.
   */
  translationsReviewed: boolean;
}

export interface ContactDetails {
  /** The inquiry mailbox, e.g. `info@…`. Rendered as a `mailto:`. */
  email: string | null;
  /**
   * The office address as ONE canonical string, newline-separated.
   *
   * One string rather than structured parts because the maps link is DERIVED
   * from it — two representations of an address is the same single-source defect
   * this module exists to prevent.
   */
  address: string | null;
  legal: ContactLegal;
  approvals: ContactApprovals;
}

/**
 * ⚠️ EVERY VALUE IS `null` UNTIL GLH SUPPLIES IT — see
 * `_bmad-output/implementation-artifacts/GLH/owner-actions.md`.
 *
 * The page, the indexability predicate and the sitemap gate are all built and
 * working; nothing below awaits code.
 *
 * ⛔ BUT SUPPLYING THE VALUES IS NOT SUFFICIENT, AND AN EARLIER VERSION OF THIS
 * DOCSTRING SAID IT WAS. It promised a "VALUES-ONLY change that needs no
 * development" and that the page "lifts itself out of `noindex` when the
 * required set is complete". That was true of the code and wrong about the
 * project: it routed straight past two written pre-launch obligations —
 * qualified legal review of the реквизиты (`prd.md:186`, DP-10/OQ7) and native
 * review of the TR/RU copy (`owner-actions.md` §3(b)) — neither of which any
 * predicate, test or gate could see. `approvals` is where they became visible.
 * Publishing therefore takes the values AND two deliberate ticks below.
 */
export const CONTACT: ContactDetails = {
  email: null,
  address: null,
  legal: {
    legalName: null,
    tradeRegistryNo: null,
    taxOffice: null,
    taxNo: null,
    mersisNo: null,
  },
  approvals: {
    legalReviewed: false,
    translationsReviewed: false,
  },
};

/** The channels /contact can render. The phone is absent — it is chrome. */
export type ContactChannel = "email" | "address" | "legal";

/** Present and not blank. The one definition of "configured", used everywhere. */
export function isSupplied(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * The supplied value, TRIMMED — or `null`.
 *
 * ⚠️ `isSupplied` TRIMS TO DECIDE, and every render path used to emit the RAW
 * value. That split is invisible while the config is all-null and becomes real
 * the moment GLH pastes an address or a mailbox with a leading space: the
 * decision says "configured", and what ships is a `mailto:` whose addr-spec is
 * padded and a maps query that begins with encoded blanks. One accessor so the
 * two can never disagree.
 *
 * Only the ENDS are trimmed: `address` is newline-separated by design and its
 * interior whitespace is load-bearing.
 */
export function suppliedValue(value: string | null | undefined): string | null {
  return isSupplied(value) ? value.trim() : null;
}

/**
 * Which channels this page can actually render.
 *
 * ⚠️ THIS IS THE ONE PREDICATE THE PAGE RENDERS FROM. It used to be advisory —
 * `page.tsx` re-derived each row with its own `isSupplied(CONTACT.…)` call, so
 * this function's answer and the page's behaviour were two implementations of
 * one rule that could drift. They are now the same call.
 *
 * ⚠️ PARTIAL CONFIGURATION IS EXPECTED AND MUST WORK. If GLH supplies the email
 * but not the address, the email renders and the address is simply absent — the
 * page is not all-or-nothing. An unconfigured channel is OMITTED ENTIRELY, never
 * drawn as an empty row or a bare label above nothing (the defect the 3.5 review
 * found on six surfaces).
 *
 * The LEGAL block is anchored on `legalName`: without the registered name the
 * numbers belong to nobody, so the block does not render at all. With it, each
 * individual number renders only if supplied — AND only once
 * `approvals.legalReviewed` is set, because publishing a company's registration
 * details is a legal disclosure and `noindex` does not withhold it from anyone.
 */
export function configuredChannels(contact: ContactDetails = CONTACT): ContactChannel[] {
  const channels: ContactChannel[] = [];
  if (isSupplied(contact.email)) channels.push("email");
  if (isSupplied(contact.address)) channels.push("address");
  if (isSupplied(contact.legal.legalName) && contact.approvals.legalReviewed) {
    channels.push("legal");
  }
  return channels;
}

/**
 * The channels a buyer can actually REACH GLH through.
 *
 * ⚠️ `legal` IS A CHANNEL FOR COUNTING BUT NOT FOR REACHING. A registered name
 * and a tax number are a disclosure, not a way to contact anybody — so a
 * legalName-only config would head the block with "Ways to reach us" over
 * content that offers no way to reach anyone. The block still renders (it is a
 * disclosure GLH deliberately supplied, and it carries its own "Company details"
 * label); it just no longer borrows a section heading that misdescribes it.
 */
export function reachChannels(contact: ContactDetails = CONTACT): ContactChannel[] {
  return configuredChannels(contact).filter((channel) => channel !== "legal");
}

/**
 * Is the page's REQUIRED set complete AND cleared for indexing?
 *
 * ⚠️ THIS IS NOT `configuredChannels().length === 0`, and the difference is the
 * whole point. A zero count already reads as thin content through `itemCount`;
 * making `isPlaceholder` mean the same thing would leave it dead code AND let a
 * page with a single configured channel advertise itself while the address and
 * the legal details are still missing. A contact page that names an email and
 * nothing else is not a contact page a search engine should send anyone to.
 *
 * ⚠️ AND IT IS NOT VALUES ALONE. `translationsReviewed` is a separate, explicit
 * term: the page can be complete, correct and fully rendered while its Turkish
 * and Russian copy is still machine-drafted. Reachable is not the same as
 * advertised, and only the second one is what `owner-actions.md` §3(b) gates.
 */
export function isFullyConfigured(contact: ContactDetails = CONTACT): boolean {
  const channels = configuredChannels(contact);
  return (
    channels.includes("email") &&
    channels.includes("address") &&
    channels.includes("legal") &&
    contact.approvals.translationsReviewed
  );
}

/**
 * The outbound maps URL, DERIVED from the address (Story 3.8 AC3).
 *
 * ⚠️ DERIVED, NEVER STORED. A second copy of the address is exactly the
 * single-source failure this module prevents everywhere else.
 *
 * ⚠️ AND IT ISSUES NO THIRD-PARTY REQUEST. FR46 forbids a map embed — an
 * iframe, a script or a tile fetch would set third-party cookies before consent,
 * which is Story 5.2's territory. This is an ordinary outbound `<a>`: nothing
 * loads from Google unless the buyer clicks it and leaves.
 */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
