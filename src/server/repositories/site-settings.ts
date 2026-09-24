import { cache } from "react";
import { prisma } from "@/lib/db";
import { cached } from "@/lib/cache";
import { TAGS } from "@/lib/cache-tags";
import { CONTACT, suppliedValue, type ContactDetails } from "@/config/contact";
import { SITE, type SitePhone } from "@/config/site";

/**
 * The `SiteSettings` singleton reader (Story 4.8) — the reader Story 4.0
 * deliberately deferred. It repoints the public phone and contact/legal VALUES
 * from `src/config/{site,contact}.ts` onto the admin-editable row, with those
 * config constants as the field-by-field FALLBACK (the 4.4b `getHomeContent`
 * idiom: an unseeded or blank field falls back, so the page never renders empty).
 *
 * ⛔ VALUES ONLY. `getContactDetails` sources `approvals` from the CODE
 * `CONTACT.approvals`, NEVER from the row — Story 4.0 AC4: a togglable DB approval
 * column would let an admin self-approve legal review / indexing. The row carries
 * the values; the two human gates stay commit-flipped in `contact.ts`.
 *
 * ⚠️ NOT the RFQ notification recipient. `rfqNotifyTo` lives in the same row but
 * is read by `resolveNotifyRecipient` (`src/lib/email.ts`) UNCACHED, so the next
 * RFQ routes to a just-changed recipient — see that function.
 */

const SINGLETON = "singleton";

export type { SitePhone };

/** Uncached read of the phone, row value with `SITE` fallback. Exported for tests. */
export async function querySitePhone(): Promise<SitePhone> {
  const row = await prisma.siteSettings.findUnique({
    where: { id: SINGLETON },
    select: { phone: true, phoneDisplay: true },
  });
  return {
    phone: suppliedValue(row?.phone) ?? SITE.phone,
    phoneDisplay: suppliedValue(row?.phoneDisplay) ?? SITE.phoneDisplay,
  };
}

/**
 * The phone every `tel:` surface renders (Story 4.8, AC5). Cached + tagged
 * `settings`; `cache()` dedups to one DB read per request across the ~15 server
 * consumers. The client `SiteHeader` receives the result as PROPS from the public
 * layout — it must never import this module (a `@/server/**` reader in a client
 * bundle takes every page to HTTP 500).
 */
export const getSitePhone = cache(
  async (): Promise<SitePhone> => cached(() => querySitePhone(), ["site-phone"], [TAGS.settings]),
);

/** Uncached read of the contact details (row values + CODE approvals). Exported for tests. */
export async function queryContactDetails(): Promise<ContactDetails> {
  const row = await prisma.siteSettings.findUnique({
    where: { id: SINGLETON },
    select: {
      contactEmail: true,
      contactAddress: true,
      legalName: true,
      tradeRegistryNo: true,
      taxOffice: true,
      taxNo: true,
      mersisNo: true,
    },
  });
  return {
    email: suppliedValue(row?.contactEmail) ?? CONTACT.email,
    address: suppliedValue(row?.contactAddress) ?? CONTACT.address,
    legal: {
      legalName: suppliedValue(row?.legalName) ?? CONTACT.legal.legalName,
      tradeRegistryNo: suppliedValue(row?.tradeRegistryNo) ?? CONTACT.legal.tradeRegistryNo,
      taxOffice: suppliedValue(row?.taxOffice) ?? CONTACT.legal.taxOffice,
      taxNo: suppliedValue(row?.taxNo) ?? CONTACT.legal.taxNo,
      mersisNo: suppliedValue(row?.mersisNo) ?? CONTACT.legal.mersisNo,
    },
    // ⛔ Always from CODE, never the row (Story 4.0 AC4). The admin form edits
    // values; flipping these two gates stays a deliberate commit.
    approvals: { ...CONTACT.approvals },
  };
}

/**
 * The `ContactDetails` the `/contact` page AND `sitemap.ts` both build from
 * (Story 4.8, AC4). Values from the row (config fallback), approvals from code.
 * Passed into the existing `contactSignals`/`configuredChannels`/`isFullyConfigured`
 * helpers so the robots tag and the sitemap gate read ONE object and cannot drift.
 * Cached + tagged `settings`.
 */
export const getContactDetails = cache(
  async (): Promise<ContactDetails> =>
    cached(() => queryContactDetails(), ["contact-details"], [TAGS.settings]),
);

// ---- Admin edit (Story 4.8) -----------------------------------------------

/** The editable value columns of the singleton (all nullable). NO approvals. */
export interface SiteSettingsValues {
  contactEmail: string | null;
  contactAddress: string | null;
  legalName: string | null;
  tradeRegistryNo: string | null;
  taxOffice: string | null;
  taxNo: string | null;
  mersisNo: string | null;
  phone: string | null;
  phoneDisplay: string | null;
  rfqNotifyTo: string | null;
}

/** Load the singleton's raw values for the admin form (nulls preserved). */
export async function getSiteSettingsForEdit(): Promise<SiteSettingsValues> {
  const row = await prisma.siteSettings.findUnique({
    where: { id: SINGLETON },
    select: {
      contactEmail: true,
      contactAddress: true,
      legalName: true,
      tradeRegistryNo: true,
      taxOffice: true,
      taxNo: true,
      mersisNo: true,
      phone: true,
      phoneDisplay: true,
      rfqNotifyTo: true,
    },
  });
  return {
    contactEmail: row?.contactEmail ?? null,
    contactAddress: row?.contactAddress ?? null,
    legalName: row?.legalName ?? null,
    tradeRegistryNo: row?.tradeRegistryNo ?? null,
    taxOffice: row?.taxOffice ?? null,
    taxNo: row?.taxNo ?? null,
    mersisNo: row?.mersisNo ?? null,
    phone: row?.phone ?? null,
    phoneDisplay: row?.phoneDisplay ?? null,
    rfqNotifyTo: row?.rfqNotifyTo ?? null,
  };
}

/**
 * Upsert the singleton's values (Story 4.8). Blank strings normalize to `null`
 * (the only "not supplied" marker). NEVER writes approvals — those stay
 * code-flipped in `contact.ts`.
 */
export async function updateSiteSettings(values: SiteSettingsValues): Promise<void> {
  const data = {
    contactEmail: suppliedValue(values.contactEmail),
    contactAddress: suppliedValue(values.contactAddress),
    legalName: suppliedValue(values.legalName),
    tradeRegistryNo: suppliedValue(values.tradeRegistryNo),
    taxOffice: suppliedValue(values.taxOffice),
    taxNo: suppliedValue(values.taxNo),
    mersisNo: suppliedValue(values.mersisNo),
    phone: suppliedValue(values.phone),
    phoneDisplay: suppliedValue(values.phoneDisplay),
    rfqNotifyTo: suppliedValue(values.rfqNotifyTo),
  };
  await prisma.siteSettings.upsert({
    where: { id: SINGLETON },
    update: data,
    create: { id: SINGLETON, ...data },
  });
}
