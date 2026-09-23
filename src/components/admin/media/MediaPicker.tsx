"use client";

import { useFormContext } from "react-hook-form";
import { Field, inputClass, errorText } from "@/components/admin/catalog/CatalogFormKit";
import type { MediaPickerOption } from "@/lib/media";

/**
 * Reusable media picker (Story 4.5, AC5) — select an existing library asset by id.
 * Follows the `industryId`/`manufacturerId` `<select>` precedent (options fetched
 * server-side, passed as a prop). Registers `name` on the surrounding form (which
 * must be wrapped in `<FormProvider>`); the field holds the asset id or "" (none).
 * Each consuming action maps that id to its own storage shape (a logo href, a
 * photo key, a media entry).
 */
export function MediaPicker({
  name,
  label,
  options,
  hint,
}: {
  name: string;
  label: string;
  options: MediaPickerOption[];
  hint?: string;
}) {
  const { register, watch, formState } = useFormContext();
  const value = watch(name) as string | undefined;
  const selected = options.find((o) => o.id === value);
  const errors = formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <Field label={label} htmlFor={name} error={errorText(errors[name]?.message)} hint={hint}>
      <div className="flex items-center gap-3">
        {selected?.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- same-origin admin preview
          <img
            src={selected.href}
            alt=""
            className="h-12 w-12 shrink-0 rounded border border-border-subtle object-cover"
          />
        ) : null}
        <select id={name} className={inputClass} {...register(name)}>
          <option value="">— None —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    </Field>
  );
}
