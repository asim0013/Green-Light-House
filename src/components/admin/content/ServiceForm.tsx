"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { serviceCreateSchema, serviceUpdateSchema } from "@/server/admin/content/schema";
import { createServiceAction, updateServiceAction } from "@/server/admin/content/service-actions";
import {
  Field,
  TranslationTabs,
  NAME_DESCRIPTION_FIELDS,
  useCatalogSubmit,
  flattenTranslations,
  errorText,
  inputClass,
  submitButtonClass,
} from "@/components/admin/catalog/CatalogFormKit";

interface Values {
  id?: string;
  slug?: string;
  nameEn: string;
  descriptionEn?: string;
  nameTr?: string;
  descriptionTr?: string;
  nameRu?: string;
  descriptionRu?: string;
}

export interface ServiceInitial {
  id: string;
  slug: string;
  translations: { locale: string; name: string; description: string | null }[];
}

/** Service create/edit form (Story 4.4). Slug set-at-create (Decision 2). */
export function ServiceForm({
  mode,
  initial,
}: {
  mode: "create" | "edit";
  initial?: ServiceInitial;
}) {
  const router = useRouter();
  const schema = (mode === "create"
    ? serviceCreateSchema
    : serviceUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? { id: initial.id, ...flattenTranslations(initial.translations) }
        : { slug: "", nameEn: "" },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createServiceAction : updateServiceAction,
    form.setError,
    () => {
      router.push("/admin/content/services");
      router.refresh();
    },
  );
  const errors = form.formState.errors;

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex max-w-2xl flex-col gap-5 p-8">
        {mode === "create" ? (
          <Field
            label="Slug (identifier)"
            htmlFor="slug"
            hint="Lowercase letters, digits and hyphens. Set once — it becomes the public URL."
            error={errorText(errors.slug?.message)}
          >
            <input id="slug" className={inputClass} {...form.register("slug")} />
          </Field>
        ) : (
          <>
            <input type="hidden" {...form.register("id")} />
            <p className="font-mono text-[12px] text-muted">Slug: {initial?.slug} (fixed)</p>
          </>
        )}
        <TranslationTabs fields={NAME_DESCRIPTION_FIELDS} />
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
            {mode === "create" ? "Create service" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
