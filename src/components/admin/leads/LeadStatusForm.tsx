"use client";

import { useForm } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { leadStatusSchema } from "@/server/admin/leads/schema";
import { updateLeadStatusAction } from "@/server/admin/leads/actions";
import {
  Field,
  useCatalogSubmit,
  errorText,
  inputClass,
  submitButtonClass,
} from "@/components/admin/catalog/CatalogFormKit";

type Status = "new" | "in_review" | "quoted" | "closed";
const STATUS_OPTIONS: { value: Status; label: string }[] = [
  { value: "new", label: "New" },
  { value: "in_review", label: "In review" },
  { value: "quoted", label: "Quoted" },
  { value: "closed", label: "Closed" },
];

interface Values {
  id: string;
  status: Status;
}

/** Set a lead's status (Story 4.7). A single-field mutation via the shared submit bridge. */
export function LeadStatusForm({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(leadStatusSchema as unknown as z.ZodType<Values>),
    defaultValues: { id, status },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    updateLeadStatusAction,
    form.setError,
    () => router.refresh(),
  );
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <form onSubmit={form.handleSubmit(submit)} className="flex items-end gap-3">
      <input type="hidden" {...form.register("id")} />
      <Field label="Status" htmlFor="status" error={errorText(errors.status?.message)}>
        <select id="status" className={inputClass} {...form.register("status")}>
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <button type="submit" disabled={form.formState.isSubmitting} className={submitButtonClass}>
        Save status
      </button>
      {formError && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {formError}
        </p>
      )}
    </form>
  );
}
