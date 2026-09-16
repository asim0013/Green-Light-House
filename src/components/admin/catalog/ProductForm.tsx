"use client";

import { useForm, FormProvider, useFieldArray } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { productCreateSchema, productUpdateSchema } from "@/server/admin/catalog/schema";
import { createProductAction, updateProductAction } from "@/server/admin/catalog/product-actions";
import {
  Field,
  TranslationTabs,
  NAME_DESCRIPTION_FIELDS,
  useCatalogSubmit,
  flattenTranslations,
  errorText,
  inputClass,
  submitButtonClass,
} from "./CatalogFormKit";

interface AttrPair {
  key: string;
  value: string;
}
interface Values {
  id?: string;
  slug?: string;
  model: string;
  manufacturerId: string;
  categoryId: string;
  seriesId?: string;
  status: "draft" | "published";
  attributes: AttrPair[];
  nameEn: string;
  descriptionEn?: string;
  nameTr?: string;
  descriptionTr?: string;
  nameRu?: string;
  descriptionRu?: string;
}

export interface Option {
  id: string;
  name: string;
}
export interface SeriesOption extends Option {
  manufacturerId: string;
}
export interface ProductInitial {
  id: string;
  slug: string;
  model: string;
  manufacturerId: string;
  categoryId: string;
  seriesId: string | null;
  status: "draft" | "published";
  attributes: AttrPair[];
  translations: { locale: string; name: string; description: string | null }[];
}

/** Product create/edit form (Story 4.3). Media is NOT edited here (Story 4.5). */
export function ProductForm({
  mode,
  initial,
  manufacturerOptions,
  categoryOptions,
  seriesOptions,
}: {
  mode: "create" | "edit";
  initial?: ProductInitial;
  manufacturerOptions: Option[];
  categoryOptions: Option[];
  seriesOptions: SeriesOption[];
}) {
  const router = useRouter();
  const schema = (mode === "create"
    ? productCreateSchema
    : productUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? {
            id: initial.id,
            model: initial.model,
            manufacturerId: initial.manufacturerId,
            categoryId: initial.categoryId,
            seriesId: initial.seriesId ?? "",
            status: initial.status,
            attributes: initial.attributes,
            ...flattenTranslations(initial.translations),
          }
        : {
            slug: "",
            model: "",
            manufacturerId: "",
            categoryId: "",
            seriesId: "",
            status: "draft",
            attributes: [],
            nameEn: "",
          },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createProductAction : updateProductAction,
    form.setError,
    () => {
      router.push("/admin/catalog/products");
      router.refresh();
    },
  );
  const errors = form.formState.errors;
  const attrs = useFieldArray({ control: form.control, name: "attributes" });
  const attributesError = (errors.attributes as { message?: string } | undefined)?.message;

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

        <Field label="Model number" htmlFor="model" error={errorText(errors.model?.message)}>
          <input id="model" className={inputClass} {...form.register("model")} />
        </Field>

        <Field
          label="Manufacturer"
          htmlFor="manufacturerId"
          error={errorText(errors.manufacturerId?.message)}
        >
          <select id="manufacturerId" className={inputClass} {...form.register("manufacturerId")}>
            <option value="">— Select —</option>
            {manufacturerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Category" htmlFor="categoryId" error={errorText(errors.categoryId?.message)}>
          <select id="categoryId" className={inputClass} {...form.register("categoryId")}>
            <option value="">— Select —</option>
            {categoryOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Series (optional)"
          htmlFor="seriesId"
          error={errorText(errors.seriesId?.message)}
        >
          <select id="seriesId" className={inputClass} {...form.register("seriesId")}>
            <option value="">— None —</option>
            {seriesOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Status"
          htmlFor="status"
          error={errorText(errors.status?.message)}
          hint="Draft products are never shown publicly."
        >
          <select id="status" className={inputClass} {...form.register("status")}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </Field>

        <fieldset className="flex flex-col gap-2 rounded border border-border-subtle p-4">
          <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
            Technical attributes
          </legend>
          {attrs.fields.map((f, i) => (
            <div key={f.id} className="flex items-center gap-2">
              <input
                placeholder="Key"
                className={inputClass}
                {...form.register(`attributes.${i}.key`)}
              />
              <input
                placeholder="Value"
                className={inputClass}
                {...form.register(`attributes.${i}.value`)}
              />
              <button
                type="button"
                onClick={() => attrs.remove(i)}
                className="rounded border border-border-subtle px-2 py-2 font-mono text-[12px] text-ink-2"
                aria-label={`Remove attribute ${i + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => attrs.append({ key: "", value: "" })}
            className="self-start rounded border border-border-subtle px-3 py-1.5 font-mono text-[12px] text-ink-2"
          >
            + Add attribute
          </button>
          {attributesError && (
            <p role="alert" className="text-[12px] text-[#B42318]">
              {errorText(attributesError)}
            </p>
          )}
        </fieldset>

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
            {mode === "create" ? "Create product" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
