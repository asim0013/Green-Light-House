"use server";

import type { Locale } from "@prisma/client";
import { TAGS } from "@/lib/cache-tags";
import { withAdminMutation, type MutationResult } from "@/server/admin/catalog/mutation";
import { updateSiteSettings } from "@/server/repositories/site-settings";
import {
  updateSlaProcessText,
  updateSlaStepText,
  reorderSlaSteps,
} from "@/server/repositories/sla";
import {
  siteSettingsSchema,
  slaProcessTextSchema,
  slaStepTextSchema,
  slaReorderSchema,
  localeTextRows,
  SLA_PROCESS_FIELDS,
  SLA_STEP_FIELDS,
} from "./schema";

/**
 * Operational-settings actions (Story 4.8). Contact/phone edits purge `settings`
 * (the public tel: surfaces + the /contact page read `SiteSettings` via that
 * tag); SLA edits purge `sla` (nine render sites). The notify recipient needs no
 * purge — `resolveNotifyRecipient` reads it uncached. NO approvals here (code).
 */
export async function updateSiteSettingsAction(
  raw: unknown,
): Promise<MutationResult<{ ok: true }>> {
  return withAdminMutation(siteSettingsSchema, raw, async (input) => {
    await updateSiteSettings({
      contactEmail: input.contactEmail ?? null,
      contactAddress: input.contactAddress ?? null,
      legalName: input.legalName ?? null,
      tradeRegistryNo: input.tradeRegistryNo ?? null,
      taxOffice: input.taxOffice ?? null,
      taxNo: input.taxNo ?? null,
      mersisNo: input.mersisNo ?? null,
      phone: input.phone ?? null,
      phoneDisplay: input.phoneDisplay ?? null,
      rfqNotifyTo: input.rfqNotifyTo ?? null,
    });
    return { tags: [TAGS.settings], data: { ok: true } };
  });
}

/** Edit the SLA process kicker/summary (per locale, EN required). */
export async function updateSlaProcessTextAction(
  raw: unknown,
): Promise<MutationResult<{ ok: true }>> {
  return withAdminMutation(slaProcessTextSchema, raw, async (input) => {
    const rows = localeTextRows(input as unknown as Record<string, unknown>, SLA_PROCESS_FIELDS);
    await updateSlaProcessText(
      input.processId,
      rows.map((r) => ({ locale: r.locale as Locale, kicker: r.kicker, summary: r.summary })),
    );
    return { tags: [TAGS.sla], data: { ok: true } };
  });
}

/** Edit one SLA step's badge/title/description (per locale, EN required). */
export async function updateSlaStepTextAction(
  raw: unknown,
): Promise<MutationResult<{ ok: true }>> {
  return withAdminMutation(slaStepTextSchema, raw, async (input) => {
    const rows = localeTextRows(input as unknown as Record<string, unknown>, SLA_STEP_FIELDS);
    await updateSlaStepText(
      input.stepId,
      rows.map((r) => ({
        locale: r.locale as Locale,
        badge: r.badge,
        title: r.title,
        description: r.description,
      })),
    );
    return { tags: [TAGS.sla], data: { ok: true } };
  });
}

/** Reorder the SLA steps via the deferred-constraint transaction (AC2). */
export async function reorderSlaStepsAction(
  raw: unknown,
): Promise<MutationResult<{ ok: true }>> {
  return withAdminMutation(slaReorderSchema, raw, async (input) => {
    await reorderSlaSteps(input.orderedStepIds);
    return { tags: [TAGS.sla], data: { ok: true } };
  });
}
