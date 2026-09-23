"use client";

import { useState, type ReactNode } from "react";
import { useFormContext, type FieldValues, type Path, type UseFormSetError } from "react-hook-form";
import type { MutationResult } from "@/server/admin/catalog/mutation";

/**
 * Reusable admin-catalog form primitives (Story 4.3) — the pattern Stories
 * 4.4/4.6/4.8 inherit. Admin copy is INLINE ENGLISH (Story 4.1/4.2), so the
 * shared stable error keys are rendered through {@link CATALOG_ERROR_TEXT},
 * NOT next-intl `t()`. The forms are react-hook-form + the reusable
 * `@/lib/zod-resolver`; the server action is authoritative and its
 * `{ error: { details } }` maps back onto fields exactly like the RFQ form.
 */

// Keyed by the shared stable error keys (Story 4.3 `CatalogErrorKey`) plus a few
// Story 4.4 editorial keys — a plain string map so content entities can add keys
// without touching the pinned `CATALOG_ERROR_KEYS` set.
export const CATALOG_ERROR_TEXT: Record<string, string> = {
  required: "Required.",
  tooLong: "Too long.",
  invalid: "This value is not valid.",
  slugInvalid: "Use lowercase letters, digits and hyphens only (e.g. flame-detectors).",
  enRequired: "English is required.",
  descriptionWithoutName: "Add a name for this language, or clear its description.",
  duplicateAttributeKey: "Attribute keys must be unique.",
  // Story 4.4 (editorial content):
  titleRequiredForLocale: "Add a title for this language, or clear its other fields.",
  // Story 4.4b (team):
  nameRequiredForLocale: "Add a name for this language, or clear its other fields.",
  // Story 4.5 (media library upload):
  fileRequired: "Choose a file to upload.",
  unsupportedType: "Unsupported file type. Images: JPG, PNG, WebP, AVIF. Video: MP4, WebM.",
  fileTooLarge: "File is too large.",
  fileCorrupt: "This file is not the type its name says it is.",
  scanFailed: "This file could not be accepted (failed a security scan).",
  storageUnavailable: "Storage is temporarily unavailable. Try again shortly.",
  unauthorized: "Your session has expired. Sign in again.",
  forbidden: "Request blocked.",
};

/** Map a stable error key (from zod or a server MutationError detail) to inline English. */
export function errorText(message?: string): string | undefined {
  if (!message) return undefined;
  return (CATALOG_ERROR_TEXT as Record<string, string>)[message] ?? "This value is not valid.";
}

export const inputClass =
  "w-full rounded border border-border-subtle bg-surface px-3 py-2 text-[14px] text-ink outline-none focus:border-ink";

/** A labelled control wrapper: label, optional hint, the control (children), and an error line. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2"
      >
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-[12px] text-muted">{hint}</p>}
      {error && (
        <p role="alert" className="text-[12px] text-[#B42318]">
          {error}
        </p>
      )}
    </div>
  );
}

const LOCALES = [
  { code: "En", label: "EN", required: true },
  { code: "Tr", label: "TR", required: false },
  { code: "Ru", label: "RU", required: false },
] as const;

/**
 * One translated field of an entity. `name` is the base field key (the form
 * registers `${name}En`/`${name}Tr`/`${name}Ru`); `required` marks the field EN
 * requires (also the tab's filled-dot signal).
 */
export interface TranslationField {
  name: string;
  label: string;
  type?: "text" | "textarea";
  required?: boolean;
}

/** Common field configs (Story 4.3/4.4). */
export const NAME_ONLY_FIELDS: TranslationField[] = [
  { name: "name", label: "Name", required: true },
];
export const NAME_DESCRIPTION_FIELDS: TranslationField[] = [
  { name: "name", label: "Name", required: true },
  { name: "description", label: "Description", type: "textarea" },
];

/**
 * The EN | TR | RU authoring tabs. Reads the form via context, so any entity
 * form wrapped in `<FormProvider>` can drop it in. Field-config driven (Story
 * 4.4 generalized it from the fixed name/description shape): EN is required for
 * the `required` field, and each tab shows a filled dot when that field is set.
 * Only the active locale's fields are shown, but ALL locale fields stay
 * registered (hidden), so validation and submission see every language.
 */
export function TranslationTabs({ fields }: { fields: TranslationField[] }) {
  const { register, watch, formState } = useFormContext();
  const [active, setActive] = useState<(typeof LOCALES)[number]["code"]>("En");
  const errors = formState.errors as Record<string, { message?: string } | undefined>;
  const indicatorField = (fields.find((f) => f.required) ?? fields[0])?.name ?? "name";

  return (
    <fieldset className="flex flex-col gap-3 rounded border border-border-subtle p-4">
      <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
        Translations
      </legend>
      <div role="tablist" aria-label="Translation language" className="flex gap-1">
        {LOCALES.map((loc) => {
          const filled = Boolean(watch(`${indicatorField}${loc.code}`));
          return (
            <button
              key={loc.code}
              type="button"
              role="tab"
              aria-selected={active === loc.code}
              onClick={() => setActive(loc.code)}
              className={`flex items-center gap-2 rounded px-3 py-1.5 font-mono text-[12px] ${
                active === loc.code ? "bg-ink text-surface" : "bg-surface-2 text-ink-2"
              }`}
            >
              {loc.label}
              {loc.required && <span aria-hidden>*</span>}
              <span
                aria-hidden
                className={`h-1.5 w-1.5 rounded-full ${filled ? "bg-accent-soft" : "bg-transparent"}`}
              />
            </button>
          );
        })}
      </div>

      {LOCALES.map((loc) => (
        <div key={loc.code} hidden={active !== loc.code} className="flex flex-col gap-3">
          {fields.map((field) => {
            const id = `${field.name}${loc.code}`;
            return (
              <Field
                key={field.name}
                label={`${field.label} (${loc.label})`}
                htmlFor={id}
                error={errorText(errors[id]?.message)}
                hint={
                  field.required && loc.required
                    ? "Shown on the public site; other languages fall back to English."
                    : undefined
                }
              >
                {field.type === "textarea" ? (
                  <textarea id={id} rows={4} className={inputClass} {...register(id)} />
                ) : (
                  <input id={id} className={inputClass} {...register(id)} />
                )}
              </Field>
            );
          })}
        </div>
      ))}
    </fieldset>
  );
}

/**
 * The submit bridge every catalog form uses: call the server action, map a
 * `validation_failed`/domain error's `details` back onto fields (stable keys),
 * surface the top-level message, and hand control to `onSuccess` on success.
 */
export function useCatalogSubmit<T extends FieldValues>(
  action: (raw: T) => Promise<MutationResult<{ id: string }>>,
  setError: UseFormSetError<T>,
  onSuccess: (id: string) => void,
) {
  const [formError, setFormError] = useState<string | null>(null);

  const submit = async (values: T) => {
    setFormError(null);
    const result = await action(values);
    if (result.ok) {
      onSuccess(result.data.id);
      return;
    }
    for (const detail of result.error.details ?? []) {
      setError(detail.path as Path<T>, { type: "server", message: detail.key });
    }
    setFormError(result.error.message);
  };

  return { submit, formError };
}

export const submitButtonClass =
  "rounded bg-ink px-4 py-2 font-mono text-[13px] uppercase tracking-[0.08em] text-surface disabled:opacity-50";

/** Spread stored translation rows into the flat `name<Locale>` / `description<Locale>` form fields. */
export function flattenTranslations(
  translations: { locale: string; name: string; description?: string | null }[],
): Record<string, string> {
  const cap: Record<string, string> = { en: "En", tr: "Tr", ru: "Ru" };
  const out: Record<string, string> = {};
  for (const t of translations) {
    const c = cap[t.locale];
    if (!c) continue;
    out[`name${c}`] = t.name;
    if (t.description) out[`description${c}`] = t.description;
  }
  return out;
}
