"use client";

import { useState } from "react";
import { useForm, FormProvider, useFieldArray, type DefaultValues } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { homeContentSchema } from "@/server/admin/content/schema";
import { updateHomeContentAction } from "@/server/admin/content/home-actions";
import {
  TranslationTabs,
  inputClass,
  submitButtonClass,
  type TranslationField,
} from "@/components/admin/catalog/CatalogFormKit";
import type { HomeContentEditData } from "@/server/repositories/home-content";

// Field order = display order; the tab filled-dot keys off the first field (title).
const HOME_FIELDS: TranslationField[] = [
  { name: "title", label: "Hero title", type: "textarea" },
  { name: "kicker", label: "Hero kicker" },
  { name: "lead", label: "Hero lead", type: "textarea" },
  { name: "noPrices", label: "No-prices line" },
  { name: "credibilityTitle", label: "Credibility title" },
  { name: "capability", label: "Capability body", type: "textarea" },
  { name: "ctaTitle", label: "Closing CTA title" },
  { name: "industriesTitle", label: "Industries title" },
  { name: "industriesSub", label: "Industries sub", type: "textarea" },
  { name: "categoriesTitle", label: "Categories title" },
  { name: "manufacturersTitle", label: "Manufacturers title" },
];

const CAP = [
  ["en", "En"],
  ["tr", "Tr"],
  ["ru", "Ru"],
] as const;

// Only `certMarksList` is typed; the 33 dynamic translation fields
// (`kickerEn`…`manufacturersTitleRu`) are registered by `TranslationTabs` via an
// untyped `useFormContext`, so they live in the form at runtime without bloating
// this type (and without the index signature that collapses RHF's path types).
interface Values {
  certMarksList: { value: string }[];
}

/** Homepage content editor (Story 4.4b) — a singleton, upsert-in-place. */
export function HomeContentForm({ initial }: { initial: HomeContentEditData }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const defaults: Record<string, unknown> = {
    certMarksList: initial.certMarks.map((value) => ({ value })),
  };
  for (const tr of initial.translations) {
    const cap = CAP.find(([loc]) => loc === tr.locale)?.[1];
    if (!cap) continue;
    const row = tr as unknown as Record<string, string | null>;
    for (const f of HOME_FIELDS) defaults[`${f.name}${cap}`] = row[f.name] ?? "";
  }

  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(homeContentSchema as unknown as z.ZodType<Values>),
    defaultValues: defaults as unknown as DefaultValues<Values>,
  });
  const certs = useFieldArray({ control: form.control, name: "certMarksList" });

  const onValid = async (values: Values) => {
    setFormError(null);
    const certMarks = values.certMarksList.map((c) => c.value.trim()).filter(Boolean);
    // Runtime `values` also carries the dynamic translation fields (RHF collects
    // every registered field); the spread forwards them to the authoritative action.
    const result = await updateHomeContentAction({
      ...(values as unknown as Record<string, unknown>),
      certMarks,
    });
    if (result.ok) {
      router.refresh();
      setFormError(null);
      return;
    }
    // `Values` carries an index signature (33 dynamic translation fields), which
    // collapses RHF's typed `setError` path to `never`; a string-path alias is the
    // localized escape hatch.
    const setServerError = form.setError as unknown as (
      name: string,
      err: { type: string; message: string },
    ) => void;
    for (const detail of result.error.details ?? []) {
      setServerError(detail.path, { type: "server", message: detail.key });
    }
    setFormError(result.error.message);
  };

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onValid)} className="flex max-w-2xl flex-col gap-5 p-8">
        <p className="text-[13px] text-ink-2">
          Homepage editorial copy. Empty fields fall back to the built-in English text.
        </p>
        <TranslationTabs fields={HOME_FIELDS} />

        <fieldset className="flex flex-col gap-2 rounded border border-border-subtle p-4">
          <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
            Certification marks
          </legend>
          {certs.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input className={inputClass} {...form.register(`certMarksList.${i}.value`)} />
              <button
                type="button"
                onClick={() => certs.remove(i)}
                className="rounded border border-border-subtle px-2 py-2 font-mono text-[12px] text-ink-2"
                aria-label={`Remove mark ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => certs.append({ value: "" })}
            className="self-start rounded border border-border-subtle px-3 py-1.5 font-mono text-[12px] text-ink-2"
          >
            + Add mark
          </button>
        </fieldset>

        {formError && (
          <p role="alert" className="text-[13px] text-[#B42318]">
            {formError}
          </p>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className={submitButtonClass}
          >
            Save homepage
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
