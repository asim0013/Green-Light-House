"use client";

import { useCallback, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { rfqSchema, TIMELINE_KEYS, type RfqInput } from "@/server/rfq/schema";
import { zodResolver } from "@/lib/zod-resolver";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { LOCALE_LABELS } from "@/components/i18n/LanguageSwitcher";
import { FormSectionCard } from "./FormSectionCard";
import { Field, fieldAria, controlClasses } from "./Field";
import { EquipmentChips } from "./EquipmentChips";
import { ConsentRow } from "./ConsentRow";
import { RfqConfirmation } from "./RfqConfirmation";

type AppLocale = (typeof routing.locales)[number];

export interface RfqIndustryOption {
  slug: string;
  name: string;
  isFallback: boolean;
}

/**
 * What the form STATE holds — DOM dialect, not schema dialect: `""` for an
 * unselected select, `false` for the unchecked box. The resolver's `normalize`
 * translates to the schema's `undefined`-for-absent before every validation, so
 * neither side bends (see `@/lib/zod-resolver`).
 */
interface RfqFormValues {
  industry: string;
  timeline: string;
  equipment: { kind: "freeText"; text: string }[];
  quantities: string;
  projectDetails: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  country: string;
  locale: AppLocale;
  consent: boolean;
}

/** The fields a server 422 detail may legally land on. */
const FIELD_NAMES = [
  "industry",
  "timeline",
  "equipment",
  "quantities",
  "projectDetails",
  "name",
  "company",
  "email",
  "phone",
  "country",
  "locale",
  "consent",
] as const;

type FieldName = (typeof FIELD_NAMES)[number];

function isFieldName(value: string): value is FieldName {
  return (FIELD_NAMES as readonly string[]).includes(value);
}

/**
 * Which failure copy a non-201/non-field-error response earns (Story 3.7a).
 * Extracted so the 429 branch is unit-testable — `renderToStaticMarkup`
 * cannot exercise the submit fetch, and an untested branch here is exactly
 * how a 429 fell through to "please try again" before this existed.
 */
export function failureKeyOf(status: number): "rateLimited" | "submitFailed" {
  return status === 429 ? "rateLimited" : "submitFailed";
}

/**
 * `RfqForm` — the app's FIRST client form (Story 3.2, AC5/AC6/AC7).
 *
 * SELF-CONTAINED AND SLOT-MOUNTABLE: Story 3.8 mounts this same island on
 * `/contact`, so it assumes NOTHING about its page — industries arrive resolved
 * as props (the page's server read), the UI locale arrives as a prop, and no
 * URL is read anywhere in here (Story 3.4 owns `?project=` and friends — AC8).
 *
 * Validation: react-hook-form (`mode: "onBlur"`) over the SHARED zod schema via
 * the hand-wired resolver — the same rules `POST /api/rfq` enforces, so the
 * client can only ever be a preview of the server's verdict. Failed submits
 * never clear entered input (RHF keeps values; `reset()` is never called on
 * failure). Server 422s map back onto fields through the same stable error
 * keys, with focus moved to the first (RHF's `shouldFocusError` only covers
 * resolver failures, so the server path calls `setError(..., { shouldFocus })`
 * itself).
 *
 * The live region is mounted FROM FIRST RENDER (empty until it has news) — a
 * region inserted together with its content is routinely not announced. It is
 * `role="status"` (polite), not assertive: focus is simultaneously moving to
 * the first invalid control, which announces itself; an assertive region would
 * clobber that announcement.
 *
 * THE HONEYPOT (Story 3.7a's shared contract, field name `website`): rendered
 * off-screen (absolute + clip — never `display:none`, which some password
 * managers still fill), `aria-hidden` with `tabIndex={-1}` (an aria-hidden
 * FOCUSABLE is itself a WCAG failure — the tabindex is what makes the
 * aria-hidden legal), `autoComplete="off"` (the one legitimate use), its label
 * INSIDE the hidden wrapper so a virtual cursor never meets an orphan label. It
 * is NOT registered with react-hook-form: it must never appear in the error
 * surface, the live region, or focus order. Its value travels in the JSON
 * payload; the schema strips it; the server check (Story 3.7a, LIVE) reads it
 * off the raw parse and answers a filled value with a fabricated success and
 * a recovery log — the enforcement contract lives in the route docstring.
 */
export function RfqForm({
  industries,
  uiLocale,
}: {
  industries: readonly RfqIndustryOption[];
  uiLocale: AppLocale;
}) {
  const t = useTranslations("Rfq");
  const [reference, setReference] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The nonce makes IDENTICAL consecutive announcements re-announce (3.2
  // review): a bare string state bails out on Object.is-equal sets, and an
  // unchanged text node is no DOM mutation — aria-live announces mutations
  // only. The nonce keys the text node, so every announce replaces it.
  const [announcement, setAnnouncement] = useState({ text: "", nonce: 0 });
  // The equipment ADD input's draft lives HERE, not in EquipmentChips (3.2
  // review): submit must be able to commit a typed-but-unchipped draft — the
  // buyer who types "20 t overhead crane" and clicks Send without pressing
  // Add must not silently lose the one thing they named.
  const [equipmentDraft, setEquipmentDraft] = useState("");
  const equipmentInputRef = useRef<HTMLInputElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);

  const normalize = useCallback(
    (values: RfqFormValues) => ({
      industry: values.industry || undefined,
      timeline: values.timeline || undefined,
      equipment: values.equipment,
      quantities: values.quantities.trim() ? values.quantities : undefined,
      projectDetails: values.projectDetails.trim() ? values.projectDetails : undefined,
      name: values.name,
      company: values.company,
      email: values.email,
      phone: values.phone.trim() ? values.phone : undefined,
      country: values.country.trim() ? values.country : undefined,
      locale: values.locale,
      // The locale of the consent text ON SCREEN — becomes `consentVersion`'s
      // suffix server-side (Task 0 #8). Distinct from `locale` above, which is
      // the buyer's preferred REPLY language.
      uiLocale,
      consent: values.consent,
    }),
    [uiLocale],
  );

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RfqFormValues, unknown, RfqInput>({
    mode: "onBlur",
    resolver: zodResolver<RfqFormValues, RfqInput>(rfqSchema, normalize),
    defaultValues: {
      industry: "",
      timeline: "",
      equipment: [],
      quantities: "",
      projectDetails: "",
      name: "",
      company: "",
      email: "",
      phone: "",
      country: "",
      // Preselected to the page's locale (AC6); the buyer may prefer another.
      locale: uiLocale,
      consent: false,
    },
  });

  /* eslint-disable react-hooks/incompatible-library -- `watch()` is
     react-hook-form's documented subscription API; the React Compiler cannot
     memoize it and bails on this component, which is acceptable: a form island
     re-rendering on its own input events is its normal mode. */
  const equipment = watch("equipment");
  const selectedIndustry = watch("industry");
  const industryIsFallback =
    industries.find((option) => option.slug === selectedIndustry)?.isFallback ?? false;
  /* eslint-enable react-hooks/incompatible-library */

  /** The stable key → the localized message (the shared-schema doctrine). */
  const errorText = (name: FieldName): string | undefined => {
    const key = errors[name]?.message;
    return key ? t(`errors.${key}`) : undefined;
  };

  const announce = (message: string) =>
    setAnnouncement((current) => ({ text: message, nonce: current.nonce + 1 }));

  /** Append one freeText chip. Revalidates only while an equipment error is
   *  showing, so fixing it clears the message without premature validation. */
  const addEquipmentChip = (text: string) => {
    setValue("equipment", [...equipment, { kind: "freeText", text }], {
      shouldValidate: !!errors.equipment,
    });
    announce(t("equipmentAdded", { label: text }));
  };

  /** Commit a non-empty draft as a chip. Runs on Add AND at submit. */
  const commitDraft = () => {
    const text = equipmentDraft.trim();
    if (!text) return;
    addEquipmentChip(text);
    setEquipmentDraft("");
  };

  const onValid = async (data: RfqInput) => {
    setSubmitError(null);
    try {
      const response = await fetch("/api/rfq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, website: honeypotRef.current?.value ?? "" }),
      });

      if (response.status === 201) {
        const body = (await response.json()) as { reference: string };
        setReference(body.reference);
        return;
      }

      if (response.status === 422) {
        const body = (await response.json().catch(() => null)) as {
          error?: { details?: { path: string; key: string }[] };
        } | null;
        const details = body?.error?.details ?? [];
        // DOM order, not zod issue order (3.2 review): FIELD_NAMES is declared
        // in render order, so "first invalid" means what a sighted user sees.
        const byField = new Map<FieldName, string>();
        for (const detail of details) {
          const field = detail.path.split(".")[0];
          if (isFieldName(field) && !byField.has(field)) byField.set(field, detail.key);
        }
        let first = true;
        for (const field of FIELD_NAMES) {
          const key = byField.get(field);
          if (key === undefined) continue;
          setError(
            field,
            { type: "server", message: key },
            // Focus the FIRST invalid control — the server path does not go
            // through the resolver, so shouldFocusError cannot do it. For the
            // ref-less equipment field, setError's shouldFocus silently
            // no-ops (RHF guards on a registered ref — 3.2 review), so the
            // add input is focused directly.
            { shouldFocus: first && field !== "equipment" },
          );
          if (first && field === "equipment") equipmentInputRef.current?.focus();
          first = false;
        }
        if (byField.size > 0) {
          announce(t("errorsSummary", { count: byField.size }));
          return;
        }
      }

      // 429 gets its OWN copy (Story 3.7a): the generic submitFailed says
      // "please try again", which against a rate limit is an invitation to
      // immediately re-trip it. Inputs are preserved either way.
      const failureKey = failureKeyOf(response.status);
      setSubmitError(t(`errors.${failureKey}`));
      announce(t(`errors.${failureKey}`));
    } catch {
      // Network failure — the entered values stay on screen for the retry.
      setSubmitError(t("errors.submitFailed"));
      announce(t("errors.submitFailed"));
    }
  };

  const onInvalid = (invalid: Record<string, unknown>) => {
    // RHF's own shouldFocusError only reaches REGISTERED fields; when
    // equipment (setValue-driven, ref-less) is the sole error, nothing else
    // will take focus, so the add input is focused here. RHF's focus pass
    // runs AFTER this callback and only touches registered invalid fields,
    // so the two cannot fight over the same submit (3.2 review).
    const fields = Object.keys(invalid);
    if (fields.length === 1 && fields[0] === "equipment") {
      equipmentInputRef.current?.focus();
    }
    announce(t("errorsSummary", { count: fields.length }));
  };

  return (
    <div>
      {/* Mounted from first render, empty until it has news — see docstring.
          The keyed span makes each announcement a NODE REPLACEMENT, so
          repeating the same text still mutates the region (3.2 review). */}
      <div role="status" aria-atomic="true" className="sr-only">
        {announcement.text ? <span key={announcement.nonce}>{announcement.text}</span> : null}
      </div>

      {reference ? (
        <RfqConfirmation reference={reference} />
      ) : (
        <form
          onSubmit={(event) => {
            // A typed-but-unchipped equipment draft commits at submit — see
            // the draft-state note above. setValue is synchronous into RHF's
            // store, so the resolver run inside handleSubmit sees the chip.
            commitDraft();
            return handleSubmit(onValid, onInvalid)(event);
          }}
          noValidate
          className="flex flex-col gap-5"
        >
          <FormSectionCard title={t("sectionProject")}>
            <Field id="rfq-industry" label={t("industryLabel")} error={errorText("industry")}>
              <select
                {...register("industry")}
                {...fieldAria("rfq-industry", !!errors.industry)}
                className={controlClasses(!!errors.industry)}
              >
                <option value="">{t("industryPlaceholder")}</option>
                {industries.map((option) => (
                  // FR34a: a fallen-back DB name is marked `lang="en"` — a
                  // FallbackNotice cannot live inside an <option>.
                  <option
                    key={option.slug}
                    value={option.slug}
                    lang={option.isFallback ? "en" : undefined}
                  >
                    {option.name}
                  </option>
                ))}
              </select>
              {industryIsFallback && <FallbackNotice isFallback />}
            </Field>

            <Field id="rfq-timeline" label={t("timelineLabel")} error={errorText("timeline")}>
              <select
                {...register("timeline")}
                {...fieldAria("rfq-timeline", !!errors.timeline)}
                className={controlClasses(!!errors.timeline)}
              >
                <option value="">{t("timelinePlaceholder")}</option>
                {TIMELINE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {t(`timeline.${key}`)}
                  </option>
                ))}
              </select>
            </Field>

            <Field id="rfq-equipment" label={t("equipmentLabel")} error={errorText("equipment")}>
              <EquipmentChips
                inputId="rfq-equipment"
                inputRef={equipmentInputRef}
                items={equipment}
                draft={equipmentDraft}
                onDraftChange={setEquipmentDraft}
                onCommit={commitDraft}
                onRemove={(index) =>
                  setValue(
                    "equipment",
                    equipment.filter((_, i) => i !== index),
                    { shouldValidate: !!errors.equipment },
                  )
                }
                announce={announce}
                hasError={!!errors.equipment}
              />
            </Field>

            <Field id="rfq-quantities" label={t("quantitiesLabel")} error={errorText("quantities")}>
              <input
                type="text"
                {...register("quantities")}
                {...fieldAria("rfq-quantities", !!errors.quantities)}
                // Quantities are machine data (DESIGN.md § typography).
                className={controlClasses(!!errors.quantities, "font-data")}
              />
            </Field>

            <Field
              id="rfq-project-details"
              label={t("projectDetailsLabel")}
              error={errorText("projectDetails")}
            >
              <textarea
                rows={6}
                placeholder={t("projectDetailsPlaceholder")}
                {...register("projectDetails")}
                {...fieldAria("rfq-project-details", !!errors.projectDetails)}
                className={controlClasses(!!errors.projectDetails, "py-3 leading-relaxed")}
              />
            </Field>
          </FormSectionCard>

          <FormSectionCard title={t("sectionDetails")}>
            <div className="grid gap-5 md:grid-cols-2">
              <Field id="rfq-name" label={t("nameLabel")} error={errorText("name")}>
                <input
                  type="text"
                  autoComplete="name"
                  placeholder={t("namePlaceholder")}
                  {...register("name")}
                  {...fieldAria("rfq-name", !!errors.name)}
                  className={controlClasses(!!errors.name)}
                />
              </Field>
              <Field id="rfq-company" label={t("companyLabel")} error={errorText("company")}>
                <input
                  type="text"
                  autoComplete="organization"
                  placeholder={t("companyPlaceholder")}
                  {...register("company")}
                  {...fieldAria("rfq-company", !!errors.company)}
                  className={controlClasses(!!errors.company)}
                />
              </Field>
              <Field id="rfq-email" label={t("emailLabel")} error={errorText("email")}>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder={t("emailPlaceholder")}
                  {...register("email")}
                  {...fieldAria("rfq-email", !!errors.email)}
                  className={controlClasses(!!errors.email)}
                />
              </Field>
              <Field id="rfq-phone" label={t("phoneLabel")} error={errorText("phone")}>
                <input
                  type="tel"
                  autoComplete="tel"
                  placeholder={t("phonePlaceholder")}
                  {...register("phone")}
                  {...fieldAria("rfq-phone", !!errors.phone)}
                  // A phone number is machine data (DESIGN.md § typography).
                  className={controlClasses(!!errors.phone, "font-data")}
                />
              </Field>
              <Field id="rfq-country" label={t("countryLabel")} error={errorText("country")}>
                <input
                  type="text"
                  autoComplete="country-name"
                  {...register("country")}
                  {...fieldAria("rfq-country", !!errors.country)}
                  className={controlClasses(!!errors.country)}
                />
              </Field>
              <Field id="rfq-locale" label={t("languageLabel")} error={errorText("locale")}>
                <select
                  {...register("locale")}
                  {...fieldAria("rfq-locale", !!errors.locale)}
                  // RHF applies defaultValues only at hydration; without this
                  // the SERVER paint of a /tr or /ru page shows "English".
                  defaultValue={uiLocale}
                  className={controlClasses(!!errors.locale)}
                >
                  {/* Endonyms — the LanguageSwitcher precedent, never from
                      messages: each language names itself. */}
                  {routing.locales.map((code) => (
                    <option key={code} value={code} lang={code}>
                      {LOCALE_LABELS[code]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <ConsentRow error={errorText("consent")} {...register("consent")} />

            {/* 3.7a's honeypot half — see the docstring's anatomy contract. */}
            <div
              aria-hidden="true"
              className="absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]"
            >
              <label htmlFor="rfq-website">Website</label>
              <input
                ref={honeypotRef}
                id="rfq-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
              <button
                type="submit"
                disabled={isSubmitting}
                className={buttonClasses("primary", "sm:shrink-0")}
              >
                {t("submit")}
              </button>
              <p className="text-[13px] text-ink-2">{t("submitNote")}</p>
            </div>
            {submitError && (
              <p role="alert" className="text-[13px] text-error">
                {submitError}
              </p>
            )}
          </FormSectionCard>
        </form>
      )}
    </div>
  );
}
