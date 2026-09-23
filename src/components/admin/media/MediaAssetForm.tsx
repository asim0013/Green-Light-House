"use client";

import { useForm, FormProvider } from "react-hook-form";
import type { z } from "zod";
import { useRouter } from "@/i18n/navigation";
import { zodResolver } from "@/lib/zod-resolver";
import { mediaAltSchema } from "@/server/admin/media/schema";
import { updateMediaAssetAltAction } from "@/server/admin/media/actions";
import {
  TranslationTabs,
  useCatalogSubmit,
  submitButtonClass,
  type TranslationField,
} from "@/components/admin/catalog/CatalogFormKit";

/** One translated field: the alt text (EN required — WCAG 2.1 AA). */
const MEDIA_FIELDS: TranslationField[] = [
  { name: "alt", label: "Alt text", type: "textarea", required: true },
];

const CAP: Record<string, string> = { en: "En", tr: "Tr", ru: "Ru" };

interface Values {
  id: string;
  [field: string]: unknown;
}

export interface MediaAssetInitial {
  id: string;
  href: string;
  kind: "image" | "video";
  mime: string;
  originalName: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  translations: { locale: string; alt: string }[];
}

function flattenAlt(translations: MediaAssetInitial["translations"]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of translations) {
    const c = CAP[t.locale];
    if (c) out[`alt${c}`] = t.alt;
  }
  return out;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** Media asset ALT editor (Story 4.5). Upload/replace of the file itself is the
 *  uploader on the list page; here only the per-locale alt text is edited. */
export function MediaAssetForm({ initial }: { initial: MediaAssetInitial }) {
  const router = useRouter();
  const schema = mediaAltSchema as unknown as z.ZodType<Values>;
  const form = useForm<Values>({
    mode: "onBlur",
    resolver: zodResolver<Values, Values>(schema),
    defaultValues: { id: initial.id, ...flattenAlt(initial.translations) },
  });
  const { submit, formError } = useCatalogSubmit<Values>(
    updateMediaAssetAltAction,
    form.setError,
    () => {
      router.push("/admin/media");
      router.refresh();
    },
  );

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(submit)} className="flex max-w-2xl flex-col gap-5 p-8">
        <input type="hidden" {...form.register("id")} />

        <div className="flex gap-4 rounded border border-border-subtle p-4">
          {initial.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- same-origin admin preview; no next/image optimization needed
            <img
              src={initial.href}
              alt=""
              className="h-24 w-24 rounded border border-border-subtle object-cover"
            />
          ) : (
            <video
              src={initial.href}
              className="h-24 w-24 rounded border border-border-subtle"
              muted
            />
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[12px] text-ink-2">
            <dt>File</dt>
            <dd className="text-ink">{initial.originalName}</dd>
            <dt>Type</dt>
            <dd className="text-ink">{initial.mime}</dd>
            <dt>Size</dt>
            <dd className="text-ink">{formatBytes(initial.sizeBytes)}</dd>
            {initial.width && initial.height ? (
              <>
                <dt>Dimensions</dt>
                <dd className="text-ink">
                  {initial.width}×{initial.height}
                </dd>
              </>
            ) : null}
          </dl>
        </div>

        <TranslationTabs fields={MEDIA_FIELDS} />
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
            Save alt text
          </button>
        </div>
      </form>
    </FormProvider>
  );
}
