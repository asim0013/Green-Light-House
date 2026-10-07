"use client";

import { useState } from "react";
import { useForm, useFieldArray, type DefaultValues } from "react-hook-form";
import { useRouter } from "@/i18n/navigation";
import { inputClass, submitButtonClass, Field } from "@/components/admin/catalog/CatalogFormKit";
import { createGuideAction, updateGuideAction } from "@/server/admin/guides/actions";
import type { GuideEditData } from "@/server/repositories/selection-guide";
import type { MutationResult } from "@/server/admin/catalog/mutation";

type Option = { id: string; slug: string; name: string };

const CAPS = [
  ["en", "En", "EN"],
  ["tr", "Tr", "TR"],
  ["ru", "Ru", "RU"],
] as const;

interface SectionValue {
  headingEn: string;
  headingTr: string;
  headingRu: string;
  bodyEn: string;
  bodyTr: string;
  bodyRu: string;
}
interface Values {
  slug: string;
  status: "draft" | "published";
  titleEn: string;
  titleTr: string;
  titleRu: string;
  introEn: string;
  introTr: string;
  introRu: string;
  metaEn: string;
  metaTr: string;
  metaRu: string;
  sections: SectionValue[];
  productIds: string[];
  categoryIds: string[];
}

const EMPTY_SECTION: SectionValue = {
  headingEn: "",
  headingTr: "",
  headingRu: "",
  bodyEn: "",
  bodyTr: "",
  bodyRu: "",
};

function defaultsFrom(initial?: GuideEditData): Values {
  const v: Values = {
    slug: initial?.slug ?? "",
    status: initial?.status ?? "draft",
    titleEn: "",
    titleTr: "",
    titleRu: "",
    introEn: "",
    introTr: "",
    introRu: "",
    metaEn: "",
    metaTr: "",
    metaRu: "",
    sections: [{ ...EMPTY_SECTION }],
    productIds: initial?.productIds ?? [],
    categoryIds: initial?.categoryIds ?? [],
  };
  for (const t of initial?.translations ?? []) {
    const cap = CAPS.find(([l]) => l === t.locale)?.[1];
    if (!cap) continue;
    (v as unknown as Record<string, unknown>)[`title${cap}`] = t.title;
    (v as unknown as Record<string, unknown>)[`intro${cap}`] = t.intro ?? "";
    (v as unknown as Record<string, unknown>)[`meta${cap}`] = t.metaDescription ?? "";
  }
  if (initial && initial.sections.length > 0) {
    v.sections = initial.sections.map((s) => {
      const sv: SectionValue = { ...EMPTY_SECTION };
      for (const st of s.translations) {
        const cap = CAPS.find(([l]) => l === st.locale)?.[1];
        if (!cap) continue;
        (sv as unknown as Record<string, string>)[`heading${cap}`] = st.heading;
        (sv as unknown as Record<string, string>)[`body${cap}`] = st.body;
      }
      return sv;
    });
  }
  return v;
}

/** Assemble the STRUCTURED payload the action validates (EN-only locales kept). */
function toPayload(v: Values) {
  const read = (base: string, cap: string) =>
    ((v as unknown as Record<string, string>)[`${base}${cap}`] ?? "").trim();
  const translations = CAPS.flatMap(([locale, cap]) => {
    const title = read("title", cap);
    if (!title) return []; // a guide locale needs a title to be a row (EN enforced server-side)
    return [
      {
        locale,
        title,
        intro: read("intro", cap) || null,
        metaDescription: read("meta", cap) || null,
      },
    ];
  });
  const sections = v.sections.map((s) => ({
    translations: CAPS.flatMap(([locale, cap]) => {
      const heading = ((s as unknown as Record<string, string>)[`heading${cap}`] ?? "").trim();
      const body = ((s as unknown as Record<string, string>)[`body${cap}`] ?? "").trim();
      return heading && body ? [{ locale, heading, body }] : [];
    }),
  }));
  return {
    status: v.status,
    translations,
    sections,
    productIds: v.productIds,
    categoryIds: v.categoryIds,
  };
}

export function GuideForm({
  mode,
  initial,
  productOptions,
  categoryOptions,
}: {
  mode: "create" | "edit";
  initial?: GuideEditData;
  productOptions: Option[];
  categoryOptions: Option[];
}) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<Values>({
    mode: "onBlur",
    defaultValues: defaultsFrom(initial) as DefaultValues<Values>,
  });
  const sections = useFieldArray({ control: form.control, name: "sections" });

  const onValid = async (v: Values) => {
    setFormError(null);
    const payload = toPayload(v);
    const result: MutationResult<{ id: string }> =
      mode === "create"
        ? await createGuideAction({ slug: v.slug, ...payload })
        : await updateGuideAction({ id: initial!.id, ...payload });
    if (result.ok) {
      router.push("/admin/content/guides");
      router.refresh();
      return;
    }
    setFormError(result.error.message);
  };

  const localeInputs = (base: "title" | "intro" | "meta", label: string, textarea = false) => (
    <Field label={label}>
      <div className="grid gap-2 sm:grid-cols-3">
        {CAPS.map(([, cap, abbr]) =>
          textarea ? (
            <textarea
              key={cap}
              rows={2}
              placeholder={abbr}
              className={inputClass}
              {...form.register(`${base}${cap}` as keyof Values as never)}
            />
          ) : (
            <input
              key={cap}
              placeholder={abbr}
              className={inputClass}
              {...form.register(`${base}${cap}` as keyof Values as never)}
            />
          ),
        )}
      </div>
    </Field>
  );

  const picker = (name: "productIds" | "categoryIds", label: string, options: Option[]) => (
    <fieldset className="flex flex-col gap-1 rounded border border-border-subtle p-4">
      <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
        {label}
      </legend>
      <div className="grid gap-1 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" value={o.id} {...form.register(name)} />
            {o.name} <span className="text-ink-2">({o.slug})</span>
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <form onSubmit={form.handleSubmit(onValid)} className="flex max-w-3xl flex-col gap-5 p-8">
      <p className="text-[13px] text-ink-2">
        Author in EN (required) + TR/RU (optional, fall back to EN). A guide needs a title and some
        prose (intro or a section) to be indexable; draft guides stay noindex and out of the
        sitemap.
      </p>
      {mode === "create" ? (
        <Field
          label="Slug"
          hint="lowercase-with-hyphens; the /guides/<slug> URL (immutable after create)"
        >
          <input className={inputClass} {...form.register("slug")} />
        </Field>
      ) : (
        <Field label="Slug (immutable)">
          <input className={inputClass} value={initial!.slug} disabled readOnly />
        </Field>
      )}
      <Field label="Status">
        <select className={inputClass} {...form.register("status")}>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
      </Field>

      {localeInputs("title", "Title (EN / TR / RU)")}
      {localeInputs("intro", "Intro (EN / TR / RU)", true)}
      {localeInputs("meta", "Meta description (EN / TR / RU)", true)}

      <fieldset className="flex flex-col gap-4 rounded border border-border-subtle p-4">
        <legend className="px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-ink-2">
          Sections
        </legend>
        {sections.fields.map((f, i) => (
          <div
            key={f.id}
            className="flex flex-col gap-2 border-b border-border-subtle pb-4 last:border-b-0"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[12px] text-ink-2">Section {i + 1}</span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => i > 0 && sections.move(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Move section ${i + 1} up`}
                  className="rounded border border-border-subtle px-2 py-1 text-[12px] text-ink-2 disabled:opacity-40"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => i < sections.fields.length - 1 && sections.move(i, i + 1)}
                  disabled={i === sections.fields.length - 1}
                  aria-label={`Move section ${i + 1} down`}
                  className="rounded border border-border-subtle px-2 py-1 text-[12px] text-ink-2 disabled:opacity-40"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => sections.remove(i)}
                  aria-label={`Remove section ${i + 1}`}
                  className="rounded border border-border-subtle px-2 py-1 text-[12px] text-ink-2"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {CAPS.map(([, cap, abbr]) => (
                <input
                  key={cap}
                  placeholder={`Heading ${abbr}`}
                  className={inputClass}
                  {...form.register(`sections.${i}.heading${cap}` as never)}
                />
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {CAPS.map(([, cap, abbr]) => (
                <textarea
                  key={cap}
                  rows={3}
                  placeholder={`Body ${abbr}`}
                  className={inputClass}
                  {...form.register(`sections.${i}.body${cap}` as never)}
                />
              ))}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => sections.append({ ...EMPTY_SECTION })}
          className="self-start rounded border border-border-subtle px-3 py-1.5 font-mono text-[12px] text-ink-2"
        >
          + Add section
        </button>
      </fieldset>

      {picker("productIds", "Recommended products", productOptions)}
      {picker("categoryIds", "Recommended categories", categoryOptions)}

      {formError && (
        <p role="alert" className="text-[13px] text-[#B42318]">
          {formError}
        </p>
      )}
      <div>
        <button type="submit" disabled={form.formState.isSubmitting} className={submitButtonClass}>
          {mode === "create" ? "Create guide" : "Save guide"}
        </button>
      </div>
    </form>
  );
}
