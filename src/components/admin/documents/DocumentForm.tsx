"use client";

import { useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import type { DocumentType } from "@prisma/client";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { documentCreateSchema, documentMetaSchema } from "@/server/admin/documents/schema";
import { updateDocumentMetaAction } from "@/server/admin/documents/actions";
import { DOCUMENT_ACCEPT, DOCUMENT_MAX_MEGABYTES } from "@/server/admin/documents/validate";
import type { MutationResult } from "@/server/admin/catalog/mutation";
import {
  Field,
  TranslationTabs,
  useCatalogSubmit,
  errorText,
  inputClass,
  submitButtonClass,
  type TranslationField,
} from "@/components/admin/catalog/CatalogFormKit";
import { IndustryCheckboxes } from "./IndustryCheckboxes";

const TITLE_FIELDS: TranslationField[] = [{ name: "title", label: "Title", required: true }];
const DOCUMENT_TYPES: DocumentType[] = ["datasheet", "certificate", "catalog", "manual", "drawing"];
const CAP: Record<string, string> = { en: "En", tr: "Tr", ru: "Ru" };

interface Values {
  id?: string;
  slug?: string;
  type: DocumentType;
  isPublic: boolean;
  productId?: string;
  manufacturerId?: string;
  industryIds: string[];
  titleEn: string;
  titleTr?: string;
  titleRu?: string;
}

interface Option {
  id: string;
  name: string;
}

export interface DocumentInitial {
  id: string;
  slug: string;
  type: DocumentType;
  isPublic: boolean;
  productId: string | null;
  manufacturerId: string | null;
  industryIds: string[];
  translations: { locale: string; title: string }[];
}

function flattenTitles(translations: DocumentInitial["translations"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of translations) {
    const c = CAP[t.locale];
    if (c) out[`title${c}`] = t.title;
  }
  return out;
}

/**
 * Document create/edit form (Story 4.6). CREATE posts multipart to
 * `/api/admin/documents` (slug + metadata + the file); EDIT saves metadata via the
 * server action (slug + file are NOT edited here — the file is replaced by the
 * separate ReplaceFileControl on the edit page). `slug` is the stable public
 * identity and is create-only (FR25a).
 */
export function DocumentForm({
  mode,
  initial,
  productOptions,
  manufacturerOptions,
  industryOptions,
}: {
  mode: "create" | "edit";
  initial?: DocumentInitial;
  productOptions: Option[];
  manufacturerOptions: Option[];
  industryOptions: Option[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const schema = (mode === "create"
    ? documentCreateSchema
    : documentMetaSchema) as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues:
      mode === "edit" && initial
        ? {
            id: initial.id,
            type: initial.type,
            isPublic: initial.isPublic,
            productId: initial.productId ?? "",
            manufacturerId: initial.manufacturerId ?? "",
            industryIds: initial.industryIds,
            ...flattenTitles(initial.translations),
          }
        : {
            slug: "",
            type: "datasheet",
            isPublic: true,
            productId: "",
            manufacturerId: "",
            industryIds: [],
            titleEn: "",
          },
  });

  // CREATE posts multipart to the route and adapts the JSON to a MutationResult so
  // `useCatalogSubmit` can map field errors; EDIT calls the metadata action directly.
  async function createViaRoute(values: Values): Promise<MutationResult<{ id: string }>> {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      return { ok: false, error: { code: "file_required", message: "Choose a PDF to upload." } };
    }
    const fd = new FormData();
    fd.set("slug", values.slug ?? "");
    fd.set("type", values.type);
    if (values.isPublic) fd.set("isPublic", "true");
    if (values.productId) fd.set("productId", values.productId);
    if (values.manufacturerId) fd.set("manufacturerId", values.manufacturerId);
    for (const id of values.industryIds) fd.append("industryIds", id);
    fd.set("titleEn", values.titleEn);
    if (values.titleTr) fd.set("titleTr", values.titleTr);
    if (values.titleRu) fd.set("titleRu", values.titleRu);
    fd.set("file", file);
    try {
      const res = await fetch("/api/admin/documents", { method: "POST", body: fd });
      return (await res.json()) as MutationResult<{ id: string }>;
    } catch {
      return { ok: false, error: { code: "network", message: "Upload failed. Try again." } };
    }
  }

  const { submit, formError } = useCatalogSubmit<Values>(
    mode === "create" ? createViaRoute : updateDocumentMetaAction,
    form.setError,
    () => {
      router.push("/admin/documents");
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
            hint="Lowercase letters, digits and hyphens. Set once — it becomes the public download URL."
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

        <Field label="Type" htmlFor="type" error={errorText(errors.type?.message)}>
          <select id="type" className={inputClass} {...form.register("type")}>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <TranslationTabs fields={TITLE_FIELDS} />

        <Field
          label="Product (optional)"
          htmlFor="productId"
          error={errorText(errors.productId?.message)}
        >
          <select id="productId" className={inputClass} {...form.register("productId")}>
            <option value="">— None —</option>
            {productOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Manufacturer (optional)"
          htmlFor="manufacturerId"
          error={errorText(errors.manufacturerId?.message)}
        >
          <select id="manufacturerId" className={inputClass} {...form.register("manufacturerId")}>
            <option value="">— None —</option>
            {manufacturerOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>

        <IndustryCheckboxes options={industryOptions} />

        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input type="checkbox" className="h-4 w-4" {...form.register("isPublic")} />
          Public (downloadable). Unchecked = private (returns 404).
        </label>

        {mode === "create" && (
          <Field
            label="File (PDF)"
            htmlFor="file"
            hint={`Up to ${DOCUMENT_MAX_MEGABYTES} MB. Virus-scanned before storage.`}
          >
            <input
              id="file"
              ref={fileRef}
              type="file"
              accept={DOCUMENT_ACCEPT}
              className={inputClass}
            />
          </Field>
        )}

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
            {mode === "create" ? "Create document" : "Save changes"}
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
