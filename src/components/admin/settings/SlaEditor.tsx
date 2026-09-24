"use client";

import { useState } from "react";
import { useForm, FormProvider, type DefaultValues } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import {
  updateSlaProcessTextAction,
  updateSlaStepTextAction,
  reorderSlaStepsAction,
} from "@/server/admin/settings/actions";
import {
  TranslationTabs,
  submitButtonClass,
  type TranslationField,
} from "@/components/admin/catalog/CatalogFormKit";
import type { MutationResult } from "@/server/admin/catalog/mutation";
import type { SlaEditData } from "@/server/repositories/sla";

const CAP = [
  ["en", "En"],
  ["tr", "Tr"],
  ["ru", "Ru"],
] as const;

const PROCESS_TF: TranslationField[] = [
  { name: "kicker", label: "Kicker", required: true },
  { name: "summary", label: "Summary", type: "textarea", required: true },
];
const STEP_TF: TranslationField[] = [
  { name: "badge", label: "Badge", required: true },
  { name: "title", label: "Title", required: true },
  { name: "description", label: "Description", type: "textarea", required: true },
];

/** Spread stored translation rows into flat `${field}${Cap}` form fields. */
function flatten(
  translations: { locale: string; [k: string]: string }[],
  fields: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of translations) {
    const cap = CAP.find(([loc]) => loc === t.locale)?.[1];
    if (!cap) continue;
    for (const f of fields) out[`${f}${cap}`] = t[f] ?? "";
  }
  return out;
}

/**
 * One translated-entity sub-form (the SLA process, or one step). The server
 * action is authoritative — it validates and maps field errors back — so this
 * form does no client-side zod resolution. `idName`/`idValue` is the hidden
 * `processId`/`stepId` the action needs.
 */
function TranslationForm({
  fields,
  idName,
  idValue,
  translations,
  action,
  submitLabel,
}: {
  fields: TranslationField[];
  idName: "processId" | "stepId";
  idValue: string;
  translations: { locale: string; [k: string]: string }[];
  action: (raw: Record<string, unknown>) => Promise<MutationResult<{ ok: true }>>;
  submitLabel: string;
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const defaults: Record<string, unknown> = {
    [idName]: idValue,
    ...flatten(
      translations,
      fields.map((f) => f.name),
    ),
  };
  const form = useForm<Record<string, unknown>>({
    mode: "onBlur",
    defaultValues: defaults as DefaultValues<Record<string, unknown>>,
  });

  const onValid = async (values: Record<string, unknown>) => {
    setFormError(null);
    setSaved(false);
    const result = await action({ ...values, [idName]: idValue });
    if (result.ok) {
      setSaved(true);
      router.refresh();
      return;
    }
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
      <form onSubmit={form.handleSubmit(onValid)} className="flex flex-col gap-4">
        <input type="hidden" {...form.register(idName)} />
        <TranslationTabs fields={fields} />
        {formError && (
          <p role="alert" className="text-[13px] text-[#B42318]">
            {formError}
          </p>
        )}
        {saved && !formError && <p className="text-[13px] text-ink-2">Saved.</p>}
        <div>
          <button
            type="submit"
            disabled={form.formState.isSubmitting}
            className={submitButtonClass}
          >
            {submitLabel}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}

/**
 * The SLA content editor (Story 4.8 — FR30/FR38). Edits the one process's
 * kicker/summary and each step's badge/title/description in EN/TR/RU, and
 * reorders the steps. One `revalidateTag("sla")` (in each action) reaches all
 * nine public render sites — no public SLA component is touched.
 *
 * ⚠️ Reorder goes through `reorderSlaStepsAction` → the DEFERRED-CONSTRAINT
 * transaction; the `@@unique([processId, sort])` is deferrable and cannot be an
 * ON CONFLICT arbiter (see `reorderSlaSteps`).
 */
export function SlaEditor({ initial }: { initial: SlaEditData }) {
  const router = useRouter();
  const orderedIds = initial.steps.map((s) => s.id);

  const move = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= orderedIds.length) return;
    const next = [...orderedIds];
    [next[index], next[j]] = [next[j], next[index]];
    const result = await reorderSlaStepsAction({ orderedStepIds: next });
    if (result.ok) router.refresh();
  };

  return (
    <div className="flex max-w-2xl flex-col gap-8 p-8">
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-[16px] font-semibold text-ink">Process heading</h2>
        <p className="text-[13px] text-ink-2">
          The stepper kicker and the one-line trust sentence. EN is required; TR/RU fall back to EN.
        </p>
        <TranslationForm
          fields={PROCESS_TF}
          idName="processId"
          idValue={initial.processId}
          translations={initial.translations}
          action={updateSlaProcessTextAction}
          submitLabel="Save heading"
        />
      </section>

      {initial.steps.map((step, i) => (
        <section key={step.id} className="flex flex-col gap-3 border-t border-border-subtle pt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-heading text-[16px] font-semibold text-ink">Step {i + 1}</h2>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move step ${i + 1} up`}
                className="rounded border border-border-subtle px-2 py-1 font-mono text-[12px] text-ink-2 disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === initial.steps.length - 1}
                aria-label={`Move step ${i + 1} down`}
                className="rounded border border-border-subtle px-2 py-1 font-mono text-[12px] text-ink-2 disabled:opacity-40"
              >
                ↓
              </button>
            </div>
          </div>
          <TranslationForm
            fields={STEP_TF}
            idName="stepId"
            idValue={step.id}
            translations={step.translations}
            action={updateSlaStepTextAction}
            submitLabel={`Save step ${i + 1}`}
          />
        </section>
      ))}
    </div>
  );
}
