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
}

/**
 * ⚠️ EVERY VALUE IS `null` UNTIL GLH SUPPLIES IT — see
 * `_bmad-output/implementation-artifacts/GLH/owner-actions.md`.
 *
 * This is not a stub awaiting code: the page, the indexability predicate and the
 * sitemap gate are all built and working. Supplying a value here is a
 * VALUES-ONLY change that needs no development, and the page lifts itself out of
 * `noindex` when the required set is complete.
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
};

/** The channels /contact can render. The phone is absent — it is chrome. */
export type ContactChannel = "email" | "address" | "legal";

/** Present and not blank. The one definition of "configured", used everywhere. */
export function isSupplied(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Which channels this page can actually render.
 *
 * ⚠️ PARTIAL CONFIGURATION IS EXPECTED AND MUST WORK. If GLH supplies the email
 * but not the address, the email renders and the address is simply absent — the
 * page is not all-or-nothing. An unconfigured channel is OMITTED ENTIRELY, never
 * drawn as an empty row or a bare label above nothing (the defect the 3.5 review
 * found on six surfaces).
 *
 * The LEGAL block is anchored on `legalName`: without the registered name the
 * numbers belong to nobody, so the block does not render at all. With it, each
 * individual number renders only if supplied.
 */
export function configuredChannels(contact: ContactDetails = CONTACT): ContactChannel[] {
  const channels: ContactChannel[] = [];
  if (isSupplied(contact.email)) channels.push("email");
  if (isSupplied(contact.address)) channels.push("address");
  if (isSupplied(contact.legal.legalName)) channels.push("legal");
  return channels;
}

/**
 * Is the page's REQUIRED set complete?
 *
 * ⚠️ THIS IS NOT `configuredChannels().length === 0`, and the difference is the
 * whole point. A zero count already reads as thin content through `itemCount`;
 * making `isPlaceholder` mean the same thing would leave it dead code AND let a
 * page with a single configured channel advertise itself while the address and
 * the legal details are still missing. A contact page that names an email and
 * nothing else is not a contact page a search engine should send anyone to.
 */
export function isFullyConfigured(contact: ContactDetails = CONTACT): boolean {
  return (
    isSupplied(contact.email) && isSupplied(contact.address) && isSupplied(contact.legal.legalName)
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
