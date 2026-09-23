"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { manufacturerCreateSchema, manufacturerUpdateSchema } from "@/server/admin/catalog/schema";
import {
  createManufacturerAction,
  updateManufacturerAction,
} from "@/server/admin/catalog/manufacturer-actions";
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
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import { mediaIdFromHref, type MediaPickerOption } from "@/lib/media";

interface Values {
  id?: string;
  slug?: string;
  logoAssetId?: string;
  nameEn: string;
  descriptionEn?: string;
  nameTr?: string;
  descriptionTr?: string;
  nameRu?: string;
  descriptionRu?: string;
}

export interface ManufacturerInitial {
  id: string;
  slug: string;
  logoUrl: string | null;
  translations: { locale: string; name: string; description: string | null }[];
}

/** Manufacturer create/edit form (Story 4.3). Slug is set once at create (Decision 2). */
export function ManufacturerForm({
  mode,
  initial,
  mediaOptions,
}: {
  mode: "create" | "edit";
  initial?: ManufacturerInitial;
  mediaOptions: MediaPickerOption[];
}) {
  const router = useRouter();
  // The runtime schema is the precise create/update schema; the form-values type
  // is the shared superset, hence the cast (client validation stays authoritative
  // via these exact schemas — the server re-validates regardless).
  const schema = (mode === "create"
    ? manufacturerCreateSchema
    : manufacturerUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? {
            id: initial.id,
            logoAssetId: mediaIdFromHref(initial.logoUrl) ?? "",
            ...flattenTranslations(initial.translations),
          }
        : { slug: "", nameEn: "", logoAssetId: "" },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createManufacturerAction : updateManufacturerAction,
    form.setError,
    () => {
      router.push("/admin/catalog/manufacturers");
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
        <MediaPicker
          name="logoAssetId"
          label="Logo"
          options={mediaOptions}
          hint="Pick an image from the media library. Shown on the homepage manufacturer strip."
        />
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
            {mode === "create" ? "Create manufacturer" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
