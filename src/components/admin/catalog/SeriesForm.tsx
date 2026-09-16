"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { seriesCreateSchema, seriesUpdateSchema } from "@/server/admin/catalog/schema";
import { createSeriesAction, updateSeriesAction } from "@/server/admin/catalog/series-actions";
import {
  Field,
  TranslationTabs,
  useCatalogSubmit,
  flattenTranslations,
  errorText,
  inputClass,
  submitButtonClass,
} from "./CatalogFormKit";

interface Values {
  id?: string;
  slug?: string;
  manufacturerId: string;
  nameEn: string;
  nameTr?: string;
  nameRu?: string;
}

export interface ManufacturerOption {
  id: string;
  name: string;
}
export interface SeriesInitial {
  id: string;
  slug: string;
  manufacturerId: string;
  translations: { locale: string; name: string }[];
}

/** Series create/edit form (Story 4.3). Belongs to exactly one manufacturer (required). */
export function SeriesForm({
  mode,
  initial,
  manufacturerOptions,
}: {
  mode: "create" | "edit";
  initial?: SeriesInitial;
  manufacturerOptions: ManufacturerOption[];
}) {
  const router = useRouter();
  const schema = (mode === "create"
    ? seriesCreateSchema
    : seriesUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? {
            id: initial.id,
            manufacturerId: initial.manufacturerId,
            ...flattenTranslations(initial.translations),
          }
        : { slug: "", manufacturerId: "", nameEn: "" },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createSeriesAction : updateSeriesAction,
    form.setError,
    () => {
      router.push("/admin/catalog/series");
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
        <Field
          label="Manufacturer"
          htmlFor="manufacturerId"
          error={errorText(errors.manufacturerId?.message)}
        >
          <select id="manufacturerId" className={inputClass} {...form.register("manufacturerId")}>
            <option value="">— Select a manufacturer —</option>
            {manufacturerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <TranslationTabs withDescription={false} />
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
            {mode === "create" ? "Create series" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
