"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { projectCreateSchema, projectUpdateSchema } from "@/server/admin/content/schema";
import { createProjectAction, updateProjectAction } from "@/server/admin/content/project-actions";
import {
  Field,
  TranslationTabs,
  useCatalogSubmit,
  errorText,
  inputClass,
  submitButtonClass,
  type TranslationField,
} from "@/components/admin/catalog/CatalogFormKit";
import { MediaPicker } from "@/components/admin/media/MediaPicker";
import type { MediaPickerOption } from "@/lib/media";

const PROJECT_FIELDS: TranslationField[] = [
  { name: "title", label: "Title", required: true },
  { name: "description", label: "Description", type: "textarea" },
  { name: "outcome", label: "Outcome", type: "textarea" },
  { name: "scope", label: "Scope" },
  { name: "location", label: "Location" },
];

interface Values {
  id?: string;
  slug?: string;
  industryId?: string;
  status: "draft" | "published";
  deliveredAt?: string;
  leadTimeWeeks?: string | number;
  [field: string]: unknown; // titleEn … locationRu
}

export interface ProjectTranslationInitial {
  locale: string;
  title: string;
  description: string | null;
  outcome: string | null;
  scope: string | null;
  location: string | null;
}
export interface ProjectInitial {
  id: string;
  slug: string;
  industryId: string | null;
  status: "draft" | "published";
  deliveredAt: string;
  leadTimeWeeks: number | null;
  mediaAssetId: string | null;
  translations: ProjectTranslationInitial[];
}
export interface IndustryOption {
  id: string;
  name: string;
}

const CAP: Record<string, string> = { en: "En", tr: "Tr", ru: "Ru" };

/** Spread project translation rows into the flat `title<Loc>` … `location<Loc>` fields. */
function flattenProject(translations: ProjectTranslationInitial[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of translations) {
    const c = CAP[t.locale];
    if (!c) continue;
    out[`title${c}`] = t.title;
    if (t.description) out[`description${c}`] = t.description;
    if (t.outcome) out[`outcome${c}`] = t.outcome;
    if (t.scope) out[`scope${c}`] = t.scope;
    if (t.location) out[`location${c}`] = t.location;
  }
  return out;
}

/** Project create/edit form (Story 4.4). Media + BOM lines are NOT edited here. */
export function ProjectForm({
  mode,
  initial,
  industryOptions,
  mediaOptions,
}: {
  mode: "create" | "edit";
  initial?: ProjectInitial;
  industryOptions: IndustryOption[];
  mediaOptions: MediaPickerOption[];
}) {
  const router = useRouter();
  const schema = (mode === "create"
    ? projectCreateSchema
    : projectUpdateSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? {
            id: initial.id,
            industryId: initial.industryId ?? "",
            status: initial.status,
            deliveredAt: initial.deliveredAt,
            leadTimeWeeks: initial.leadTimeWeeks ?? "",
            mediaAssetId: initial.mediaAssetId ?? "",
            ...flattenProject(initial.translations),
          }
        : {
            slug: "",
            industryId: "",
            status: "draft",
            deliveredAt: "",
            leadTimeWeeks: "",
            mediaAssetId: "",
            titleEn: "",
          },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createProjectAction : updateProjectAction,
    form.setError,
    () => {
      router.push("/admin/content/projects");
      router.refresh();
    },
  );
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;

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
          label="Industry (optional)"
          htmlFor="industryId"
          error={errorText(errors.industryId?.message)}
        >
          <select id="industryId" className={inputClass} {...form.register("industryId")}>
            <option value="">— None —</option>
            {industryOptions.map((o) => (
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
          hint="Draft projects are never shown publicly."
        >
          <select id="status" className={inputClass} {...form.register("status")}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </Field>

        <div className="flex gap-4">
          <Field
            label="Delivered (optional)"
            htmlFor="deliveredAt"
            error={errorText(errors.deliveredAt?.message)}
          >
            <input
              id="deliveredAt"
              type="date"
              className={inputClass}
              {...form.register("deliveredAt")}
            />
          </Field>
          <Field
            label="Lead time (weeks, optional)"
            htmlFor="leadTimeWeeks"
            error={errorText(errors.leadTimeWeeks?.message)}
          >
            <input
              id="leadTimeWeeks"
              type="number"
              min={0}
              className={inputClass}
              {...form.register("leadTimeWeeks")}
            />
          </Field>
        </div>

        <TranslationTabs fields={PROJECT_FIELDS} />

        <MediaPicker
          name="mediaAssetId"
          label="Primary photo (optional)"
          options={mediaOptions}
          hint="Pick an image from the media library. It is copied into the project and shown on the project page."
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
            {mode === "create" ? "Create project" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
