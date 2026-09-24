"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { siteSettingsSchema, type SiteSettingsInput } from "@/server/admin/settings/schema";
import { updateSiteSettingsAction } from "@/server/admin/settings/actions";
import { Field, errorText, inputClass, submitButtonClass } from "@/components/admin/catalog/CatalogFormKit";
import type { SiteSettingsValues } from "@/server/repositories/site-settings";

type Values = {
  contactEmail: string;
  contactAddress: string;
  legalName: string;
  tradeRegistryNo: string;
  taxOffice: string;
  taxNo: string;
  mersisNo: string;
  phone: string;
  phoneDisplay: string;
  rfqNotifyTo: string;
};

const KEYS: (keyof Values)[] = [
  "contactEmail",
  "contactAddress",
  "legalName",
  "tradeRegistryNo",
  "taxOffice",
  "taxNo",
  "mersisNo",
  "phone",
  "phoneDisplay",
  "rfqNotifyTo",
];

/**
 * Operational settings (Story 4.8) — the `SiteSettings` singleton VALUES:
 * contact email/address, the legal block, the phone, and the RFQ notification
 * recipient. Upsert-in-place. Empty fields store `null` and the public surfaces
 * fall back to `src/config/{site,contact}.ts`. NO approval fields — the two human
 * gates stay code-flipped in `contact.ts` (an admin form must not self-approve).
 */
export function SiteSettingsForm({ initial }: { initial: SiteSettingsValues }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaults = {} as Values;
  for (const k of KEYS) defaults[k] = initial[k] ?? "";

  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(siteSettingsSchema as never),
    defaultValues: defaults,
  });

  const onValid = async (values: Values) => {
    setFormError(null);
    setSaved(false);
    const result = await updateSiteSettingsAction(values as unknown as SiteSettingsInput);
    if (result.ok) {
      setSaved(true);
      router.refresh();
      return;
    }
    for (const detail of result.error.details ?? []) {
      form.setError(detail.path as keyof Values, { type: "server", message: detail.key });
    }
    setFormError(result.error.message);
  };

  const err = (k: keyof Values) => errorText(form.formState.errors[k]?.message as string | undefined);

  return (
    <form onSubmit={form.handleSubmit(onValid)} className="flex max-w-2xl flex-col gap-5 p-8">
      <p className="text-[13px] text-ink-2">
        Contact, legal and phone details, plus where new RFQs are emailed. Empty fields fall back to
        the built-in defaults. Legal review and translation-review sign-off are set in code, not
        here.
      </p>

      <Field label="RFQ notification email" htmlFor="rfqNotifyTo" error={err("rfqNotifyTo")} hint="Where a new inquiry notification is sent. The next RFQ routes here.">
        <input id="rfqNotifyTo" type="email" className={inputClass} {...form.register("rfqNotifyTo")} />
      </Field>

      <Field label="Phone — tel: number (E.164)" htmlFor="phone" error={err("phone")} hint="e.g. +902121234567 — the dial target on every page.">
        <input id="phone" className={inputClass} {...form.register("phone")} />
      </Field>
      <Field label="Phone — display label" htmlFor="phoneDisplay" error={err("phoneDisplay")} hint="e.g. +90 212 123 45 67 — the human-readable label.">
        <input id="phoneDisplay" className={inputClass} {...form.register("phoneDisplay")} />
      </Field>

      <Field label="Contact email" htmlFor="contactEmail" error={err("contactEmail")} hint="Shown on /contact once supplied.">
        <input id="contactEmail" type="email" className={inputClass} {...form.register("contactEmail")} />
      </Field>
      <Field label="Postal address" htmlFor="contactAddress" error={err("contactAddress")} hint="One address, newline-separated. The maps link is derived from it.">
        <textarea id="contactAddress" rows={3} className={inputClass} {...form.register("contactAddress")} />
      </Field>

      <Field label="Legal name (Ticaret unvanı)" htmlFor="legalName" error={err("legalName")} hint="The legal block's anchor — the block does not render without it (and legal review, set in code).">
        <input id="legalName" className={inputClass} {...form.register("legalName")} />
      </Field>
      <Field label="Trade registry no." htmlFor="tradeRegistryNo" error={err("tradeRegistryNo")}>
        <input id="tradeRegistryNo" className={inputClass} {...form.register("tradeRegistryNo")} />
      </Field>
      <Field label="Tax office (Vergi dairesi)" htmlFor="taxOffice" error={err("taxOffice")}>
        <input id="taxOffice" className={inputClass} {...form.register("taxOffice")} />
      </Field>
      <Field label="Tax no. (Vergi kimlik no)" htmlFor="taxNo" error={err("taxNo")}>
        <input id="taxNo" className={inputClass} {...form.register("taxNo")} />
      </Field>
      <Field label="MERSIS no." htmlFor="mersisNo" error={err("mersisNo")}>
        <input id="mersisNo" className={inputClass} {...form.register("mersisNo")} />
      </Field>

      {formError && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {formError}
        </p>
      )}
      {saved && !formError && <p className="text-[13px] text-ink-2">Saved.</p>}
      <div>
        <button type="submit" disabled={form.formState.isSubmitting} className={submitButtonClass}>
          Save settings
        </button>
      </div>
    </form>
  );
}
