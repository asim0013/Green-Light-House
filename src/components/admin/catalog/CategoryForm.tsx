"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { categoryCreateSchema, categoryUpdateSchema } from "@/server/admin/catalog/schema";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/server/admin/catalog/category-actions";
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
  parentId?: string;
  nameEn: string;
  nameTr?: string;
  nameRu?: string;
}

export interface CategoryOption {
  id: string;
  name: string;
}
export interface CategoryInitial {
  id: string;
  slug: string;
  parentId: string | null;
  translations: { locale: string; name: string }[];
}

/** Category create/edit form (Story 4.3). Optional self-referential parent; cycles rejected server-side. */
export function CategoryForm({
  mode,
  initial,
  parentOptions,
}: {
  mode: "create" | "edit";
  initial?: CategoryInitial;
  parentOptions: CategoryOption[];
}) {
  const router = useRouter();
  const schema = (mode === "create"
    ? categoryCreateSchema
    : categoryUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? {
            id: initial.id,
            parentId: initial.parentId ?? "",
            ...flattenTranslations(initial.translations),
          }
        : { slug: "", parentId: "", nameEn: "" },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createCategoryAction : updateCategoryAction,
    form.setError,
    () => {
      router.push("/admin/catalog/categories");
      router.refresh();
    },
  );
  const errors = form.formState.errors;
  // A category cannot parent itself; deeper cycles are caught server-side.
  const options = parentOptions.filter((o) => o.id !== initial?.id);

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
          label="Parent category"
          htmlFor="parentId"
          error={errorText(errors.parentId?.message)}
        >
          <select id="parentId" className={inputClass} {...form.register("parentId")}>
            <option value="">— None (top level) —</option>
            {options.map((o) => (
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
            {mode === "create" ? "Create category" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
