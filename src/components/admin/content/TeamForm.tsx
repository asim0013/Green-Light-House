"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { teamCreateSchema, teamUpdateSchema } from "@/server/admin/content/schema";
import {
  createTeamMemberAction,
  updateTeamMemberAction,
} from "@/server/admin/content/team-actions";
import {
  Field,
  TranslationTabs,
  useCatalogSubmit,
  errorText,
  inputClass,
  submitButtonClass,
  type TranslationField,
} from "@/components/admin/catalog/CatalogFormKit";

const TEAM_FIELDS: TranslationField[] = [
  { name: "name", label: "Name", required: true },
  { name: "role", label: "Role" },
  { name: "bio", label: "Bio", type: "textarea" },
];

const CAP: Record<string, string> = { en: "En", tr: "Tr", ru: "Ru" };

interface Values {
  id?: string;
  order: number | string;
  [field: string]: unknown;
}

export interface TeamInitial {
  id: string;
  order: number;
  translations: { locale: string; name: string; role: string | null; bio: string | null }[];
}

function flattenTeam(translations: TeamInitial["translations"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of translations) {
    const c = CAP[t.locale];
    if (!c) continue;
    out[`name${c}`] = t.name;
    if (t.role) out[`role${c}`] = t.role;
    if (t.bio) out[`bio${c}`] = t.bio;
  }
  return out;
}

/** Team member create/edit form (Story 4.4b). Photo is NOT edited here (Story 4.5). */
export function TeamForm({ mode, initial }: { mode: "create" | "edit"; initial?: TeamInitial }) {
  const router = useRouter();
  const schema = (mode === "create"
    ? teamCreateSchema
    : teamUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? { id: initial.id, order: initial.order, ...flattenTeam(initial.translations) }
        : { order: 0, nameEn: "" },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createTeamMemberAction : updateTeamMemberAction,
    form.setError,
    () => {
      router.push("/admin/content/team");
      router.refresh();
    },
  );
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex max-w-2xl flex-col gap-5 p-8">
        {mode === "edit" && <input type="hidden" {...form.register("id")} />}
        <Field
          label="Sort order"
          htmlFor="order"
          error={errorText(errors.order?.message)}
          hint="Lower numbers appear first."
        >
          <input
            id="order"
            type="number"
            min={0}
            className={inputClass}
            {...form.register("order")}
          />
        </Field>
        <TranslationTabs fields={TEAM_FIELDS} />
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
            {mode === "create" ? "Create member" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
