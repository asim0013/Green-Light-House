"use client";

import { useFormContext } from "react-hook-form";

/**
 * Industry multi-select (Story 4.6) — a checkbox group registered on the form as
 * `industryIds` (string[]). No multi-select component existed; a checkbox group is
 * the simplest accessible control. RHF collects the checked `value`s into an array
 * when several checkboxes share the field name.
 */
export function IndustryCheckboxes({ options }: { options: { id: string; name: string }[] }) {
  const { register } = useFormContext();
  return (
    <fieldset className="flex flex-col gap-2 rounded border border-border-subtle p-4">
      <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
        Industries
      </legend>
      {options.length === 0 ? (
        <p className="text-[12px] text-muted">No industries yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                value={o.id}
                className="h-4 w-4"
                {...register("industryIds")}
              />
              {o.name}
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
