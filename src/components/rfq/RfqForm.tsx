"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslations } from "next-intl";
import { routing } from "@/i18n/routing";
import { rfqSchema, TIMELINE_KEYS, type RfqInput } from "@/server/rfq/schema";
import type { LeadEquipmentItem } from "@/server/rfq/contracts";
import type { RfqPrefill } from "@/server/rfq-prefill";
import { zodResolver } from "@/lib/zod-resolver";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { LOCALE_LABELS } from "@/components/i18n/LanguageSwitcher";
import { ATTACHMENT_FORMATS, ATTACHMENT_MAX_BYTES, extensionOf } from "@/server/rfq/attachment";
import { FormSectionCard } from "./FormSectionCard";
import { Field, fieldAria, controlClasses } from "./Field";
import { EquipmentChips } from "./EquipmentChips";
import { ConsentRow } from "./ConsentRow";
import { AttachmentField } from "./AttachmentField";
import { RfqConfirmation } from "./RfqConfirmation";
import { PrefillBanner } from "./PrefillBanner";
import { submitRfq } from "./submit-rfq";

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
  /** ⚠️ THE FROZEN UNION, not freeText-only. Story 3.2 shipped this narrowed
   *  because the FORM only ever creates typed chips — but Story 3.4 PRE-LOADS
   *  catalog chips, and `product`/`category` items carry `label`, not `text`.
   *  Left narrow, every pre-filled chip rendered "Remove undefined" as its
   *  accessible name. The endpoint has accepted all three variants since 3.2. */
  equipment: LeadEquipmentItem[];
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
 * A COURTESY pre-check on the picked file (Story 3.7b, AC7): it saves a buyer
 * from spending two minutes uploading a 40 MB file only to be told no. It is
 * NOT a gate — the server re-derives all of this from the same constants, and
 * magic-byte inspection is deliberately left there, where it belongs and where
 * it cannot be skipped. Returns a stable error key, never a sentence.
 */
export function precheckAttachment(file: File): "fileTooLarge" | "fileType" | undefined {
  if (file.size > ATTACHMENT_MAX_BYTES) return "fileTooLarge";
  const extension = extensionOf(file.name);
  if (!ATTACHMENT_FORMATS.some((format) => format.extension === extension)) return "fileType";
  return undefined;
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
  prefill = null,
}: {
  industries: readonly RfqIndustryOption[];
  uiLocale: AppLocale;
  /** The resolved doorway context, or null for a cold visit. The PAGE resolves
   *  it; this island never reads a URL (Story 3.8 mounts it on /contact too). */
  prefill?: RfqPrefill | null;
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
  // The banner's own visibility. Separate from the `prefill` prop, which is the
  // server's answer and never changes for a given mount — this is what Clear
  // turns off. `prefillCleared` travels in the payload so the server can record
  // it in `Lead.prefillContext` (AC9).
  const [activePrefill, setActivePrefill] = useState(prefill);
  const [prefillCleared, setPrefillCleared] = useState(false);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const industryRef = useRef<HTMLSelectElement>(null);
  const projectDetailsRef = useRef<HTMLTextAreaElement>(null);
  const equipmentInputRef = useRef<HTMLInputElement>(null);
  const honeypotRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  // The attachment lives OUTSIDE react-hook-form (Story 3.7b): a `File` is not
  // a form value the shared zod schema knows about — the schema validates the
  // JSON payload, and the file rides beside it as a separate multipart part
  // (Task 0 #2). Its error is a stable KEY, mapped from either the local
  // pre-check or the server's `{ path: "attachment", key }` detail.
  const [file, setFile] = useState<File | null>(null);
  const [attachmentErrorKey, setAttachmentErrorKey] = useState<string | undefined>(undefined);
  // `undefined` = idle, `null` = in flight with an unknown total, 0-100 = live.
  const [uploadPercent, setUploadPercent] = useState<number | null | undefined>(undefined);

  /**
   * What travels to the server for attribution (AC9): the ORIGINAL PARAMS the
   * doorway supplied, plus whether Clear was pressed. Deliberately NOT a
   * `source` — the server re-resolves that, so a modified client cannot forge
   * where a lead came from. `undefined` for a cold visit, so a direct POST and a
   * doorway-less submit are indistinguishable, as they should be.
   */
  const prefillPayload = useMemo(
    () => (prefill ? { ...prefill.params, cleared: prefillCleared } : undefined),
    [prefill, prefillCleared],
  );

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
      // AC9. The ORIGINAL PARAMS travel, never a `source` — the server
      // re-resolves attribution from these, because a browser cannot be
      // trusted to report its own provenance. `cleared` is the one thing only
      // the client knows.
      prefill: prefillPayload,
    }),
    [uiLocale, prefillPayload],
  );

  const {
    register,
    handleSubmit,
    setValue,
    setError,
    watch,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<RfqFormValues, unknown, RfqInput>({
    mode: "onBlur",
    resolver: zodResolver<RfqFormValues, RfqInput>(rfqSchema, normalize),
    // ⚠️ `defaultValues` IS THE RIGHT MECHANISM BUT IT DOES NOT PAINT THE SERVER
    // HTML. RHF applies these on mount, so every pre-filled REGISTERED control
    // also carries an explicit `defaultValue` below — otherwise the SSR paint is
    // empty and the values appear only once hydration lands. `watch()`-driven
    // state (the chips) needs nothing: it reads defaultValues on first render.
    defaultValues: {
      industry: prefill?.industry?.slug ?? "",
      timeline: "",
      equipment: prefill?.equipment ?? [],
      quantities: "",
      projectDetails: prefill?.query ?? "",
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

  // Registered once so their refs can be merged with the focus handles Clear
  // needs (see the two controls below).
  const registerIndustry = register("industry");
  const registerProjectDetails = register("projectDetails");

  /** The stable key → the localized message (the shared-schema doctrine). */
  const errorText = (name: FieldName): string | undefined => {
    const key = errors[name]?.message;
    return key ? t(`errors.${key}`) : undefined;
  };

  const announce = (message: string) =>
    setAnnouncement((current) => ({ text: message, nonce: current.nonce + 1 }));

  /**
   * CLEAR: empty what the doorway seeded, leave what the buyer typed (AC8).
   *
   * ⚠️ "CLEARING IS NOT HIDING" — hiding the banner while the values stayed would
   * send an inquiry carrying context the buyer explicitly rejected. So this calls
   * `setValue`; it never merely unmounts the banner.
   *
   * THE PROVENANCE RULE, and why it is not `dirtyFields`. RHF's `dirtyFields`
   * answers "changed since defaultValues", which is the wrong question twice
   * over: it is not subscribed here, and neither equipment `setValue` passes
   * `shouldDirty`, so `dirtyFields.equipment` could never become true anyway.
   * Instead:
   *   - SCALAR FIELDS: clear one only while its current value is still EXACTLY
   *     what the pre-fill seeded. The moment the buyer edits it, it is theirs.
   *   - EQUIPMENT: drop only `product`/`category` chips. This is a free, exact
   *     discriminator rather than invented provenance — the form itself creates
   *     `freeText` chips EXCLUSIVELY (see `EquipmentChips`), so a catalog-kind
   *     chip can only have come from the doorway.
   */
  const clearPrefill = () => {
    const seeded = prefill;
    if (!seeded) return;

    if (seeded.industry && getValues("industry") === seeded.industry.slug) {
      setValue("industry", "");
    }
    if (seeded.query && getValues("projectDetails") === seeded.query) {
      setValue("projectDetails", "");
    }
    setValue(
      "equipment",
      getValues("equipment").filter((item) => item.kind === "freeText"),
      { shouldValidate: !!errors.equipment },
    );

    setActivePrefill(null);
    setPrefillCleared(true);
    announce(t("prefillCleared"));
    // Focus must not fall to <body> when the banner unmounts. It goes to the
    // FIRST CONTROL THE PRE-FILL ACTUALLY TOUCHED — not unconditionally the
    // industry select, which for the `?q=` doorway was never seeded and would
    // strand the buyer somewhere they had no reason to be.
    const target = seeded.industry
      ? industryRef.current
      : seeded.query
        ? projectDetailsRef.current
        : equipmentInputRef.current;
    target?.focus();
  };

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
    setAttachmentErrorKey(undefined);
    // A local pre-check failure never reaches the wire: there is no point
    // uploading 40 MB to be told it is 40 MB.
    if (file) {
      const localKey = precheckAttachment(file);
      if (localKey) {
        setAttachmentErrorKey(localKey);
        announce(t("errorsSummary", { count: 1 }));
        attachmentInputRef.current?.focus();
        return;
      }
    }
    try {
      const response = await submitRfq(
        { ...data, website: honeypotRef.current?.value ?? "" },
        file,
        // Only ever called on the multipart path; the JSON path stays idle, so
        // a submission with no file renders no progress bar at all.
        (percent) => setUploadPercent(percent),
      );

      if (response.status === 201) {
        setReference((response.body as { reference: string }).reference);
        return;
      }

      if (response.status === 422) {
        const body = response.body as {
          error?: { details?: { path: string; key: string }[] };
        } | null;
        const details = body?.error?.details ?? [];
        // The attachment is not a react-hook-form field, so its detail is
        // pulled out before the RHF mapping below rather than being silently
        // dropped by `isFieldName`.
        const attachmentDetail = details.find((detail) => detail.path === "attachment");
        if (attachmentDetail) setAttachmentErrorKey(attachmentDetail.key);
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
        const count = byField.size + (attachmentDetail ? 1 : 0);
        if (count > 0) {
          // The attachment takes focus only when it is the SOLE problem: when a
          // required field is also wrong, that field is earlier in DOM order
          // and the loop above has already focused it.
          if (byField.size === 0 && attachmentDetail) attachmentInputRef.current?.focus();
          announce(t("errorsSummary", { count }));
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
    } finally {
      // Back to idle on EVERY exit, including the 201 (the confirmation
      // replaces the form) and the throw. Leaving a progress bar frozen at 97%
      // under an error message is its own small lie about what happened.
      setUploadPercent(undefined);
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
        <>
          {/* INSIDE the success conditional, deliberately: on a 201 the banner
              must disappear with the form. Rendered above it, it would sit
              beside the "thank you" surface still offering a Clear button for a
              submission that already happened. It DOES survive a failed submit —
              this branch is only taken on success, and the failure paths never
              reset state (the shipped invariant at the top of this file). */}
          {activePrefill && (
            <div className="mb-5">
              <PrefillBanner
                prefill={activePrefill}
                onClear={clearPrefill}
                clearRef={clearButtonRef}
              />
            </div>
          )}
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
                {/* `defaultValue` is explicit, not redundant with `defaultValues`:
                  RHF applies those only at hydration, so without it the SSR paint
                  shows an empty select and the pre-filled industry appears late.
                  The locale select below carries the same treatment for the same
                  reason. */}
                <select
                  {...registerIndustry}
                  ref={(element) => {
                    // BOTH refs, not one: `register` owns its own ref and dropping
                    // it would unregister the control, while Clear needs a handle
                    // to move focus here.
                    registerIndustry.ref(element);
                    industryRef.current = element;
                  }}
                  defaultValue={prefill?.industry?.slug ?? ""}
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

              <Field
                id="rfq-quantities"
                label={t("quantitiesLabel")}
                error={errorText("quantities")}
              >
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
                  {...registerProjectDetails}
                  ref={(element) => {
                    registerProjectDetails.ref(element);
                    projectDetailsRef.current = element;
                  }}
                  defaultValue={prefill?.query ?? ""}
                  {...fieldAria("rfq-project-details", !!errors.projectDetails)}
                  className={controlClasses(!!errors.projectDetails, "py-3 leading-relaxed")}
                />
              </Field>

              {/* Story 3.7b. Last in section 1 because it is the optional
                supporting artefact for everything above it — a buyer who has
                just described the project is the one with a spec to attach. */}
              <AttachmentField
                id="rfq-attachment"
                inputRef={attachmentInputRef}
                file={file}
                onSelect={(next) => {
                  setFile(next);
                  // Clear a stale verdict the moment the subject changes: the
                  // previous file's rejection says nothing about this one.
                  setAttachmentErrorKey(next ? precheckAttachment(next) : undefined);
                }}
                errorKey={attachmentErrorKey}
                uploadPercent={uploadPercent}
                announce={announce}
              />
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
        </>
      )}
    </div>
  );
}
