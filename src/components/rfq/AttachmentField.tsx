"use client";

import { useState, type DragEvent, type RefObject } from "react";
import { useTranslations } from "next-intl";
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_FORMAT_LIST,
  ATTACHMENT_MAX_MEGABYTES,
} from "@/server/rfq/attachment";

/**
 * The RFQ attachment control (Story 3.7b, AC7/AC8).
 *
 * A REAL `<input type="file">` IS THE CONTROL. Drag-and-drop is an enhancement
 * layered on top of it, never the only path: a drop target is unreachable by
 * keyboard, invisible to a screen reader, and impossible on a phone. The input
 * keeps its own label, its own focus ring and its own 44px target; removing
 * every drag handler below would leave a fully usable field.
 *
 * ⚠️ `border-ink-2`, NOT `border-muted`. This field lives on the RFQ page,
 * which is the one surface built white-cards-on-grey — and `muted` measures
 * **2.89:1** against `surface-2`, under 1.4.11's 3:1 for a control boundary.
 * The same token that passes on every other page fails here.
 *
 * ⚠️ THE IN-FLIGHT STATE IS A DECISION THIS STORY TOOK, NOT ONE IT LOOKED UP:
 * the canvas has no upload state at all. A 15 MB file on a site connection is
 * long enough that a dimmed button is not feedback, so this renders a
 * DETERMINATE `<progress>` whenever the browser reports a total (it falls back
 * to indeterminate when it does not) and marks the region `aria-busy`.
 * The live region announces the SELECTION and the REMOVAL — deliberately NOT
 * the percentage: pushing every tick through a polite region turns a 15 MB
 * upload into a minute of chatter that talks over anything else the page says,
 * and `aria-busy` is the assistive-tech signal for "this region is updating".
 * (3.7b review: an earlier version of this comment CLAIMED the percentage was
 * announced — the code never did it, and the honest version is also the
 * better design.)
 *
 * CLIENT-SIDE VALIDATION IS A COURTESY, NOT A GATE. The size and extension
 * checks below exist so a buyer learns about a 40 MB file before spending two
 * minutes uploading it. The SERVER re-derives every one of them from the same
 * constants (`@/server/rfq/attachment`), so bypassing this changes nothing.
 */
export function AttachmentField({
  id,
  inputRef,
  file,
  onSelect,
  errorKey,
  uploadPercent,
  announce,
}: {
  id: string;
  /** Owned by the parent, the `EquipmentChips` precedent: the form focuses this
   *  control when the attachment is the only thing the server rejected. */
  inputRef: RefObject<HTMLInputElement | null>;
  file: File | null;
  /** `null` clears the selection. The parent owns the value. */
  onSelect: (file: File | null) => void;
  /** A STABLE error key (`fileTooLarge`, `scanFailed`, …), never a sentence —
   *  the same keys the endpoint returns. Localized here because this component
   *  already holds the constants the messages interpolate. */
  errorKey?: string;
  /** 0-100 while uploading, `null` for indeterminate, `undefined` when idle. */
  uploadPercent?: number | null;
  announce: (message: string) => void;
}) {
  const t = useTranslations("Rfq");
  const [dragging, setDragging] = useState(false);

  const uploading = uploadPercent !== undefined;
  const constraintsId = `${id}-constraints`;

  /** The values the constraint line and the size error interpolate — FORMATTED
   *  FROM THE SERVER CONSTANTS, never re-typed as literals (Task 0 #13). */
  const constraintValues = {
    formats: ATTACHMENT_FORMAT_LIST,
    size: ATTACHMENT_MAX_MEGABYTES,
    unit: t("unitMegabytes"),
  };

  const error = errorKey ? t(`errors.${errorKey}`, constraintValues) : undefined;
  const describedBy = [error ? `${id}-error` : null, constraintsId].filter(Boolean).join(" ");

  const select = (next: File | null) => {
    onSelect(next);
    if (next) announce(t("attachmentSelected", { name: next.name }));
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) select(dropped);
  };

  return (
    <div className="flex flex-col gap-1.5">
      {/* Same mono-11 voice as `Field`, stored natural-case and uppercased in
          CSS — a baked-in uppercase breaks Turkish dotted İ (Story 3.2, AC5). */}
      <label htmlFor={id} className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-2">
        {t("attachmentLabel")}
      </label>

      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-busy={uploading || undefined}
        className={[
          "flex flex-col gap-2 border border-dashed bg-surface p-3",
          // See the contrast note above: ink-2, never muted, on this page.
          error ? "border-error" : dragging ? "border-accent" : "border-ink-2",
        ].join(" ")}
      >
        <p className="text-[13px] text-ink-2">{t("attachmentAction")}</p>

        <input
          ref={inputRef}
          id={id}
          type="file"
          // Derived from the same table the server validates against.
          accept={ATTACHMENT_ACCEPT}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => select(event.target.files?.[0] ?? null)}
          className={[
            "block w-full text-[13px] text-ink",
            // The 44px floor lands on the file button, which is the thing a
            // finger actually hits. `file:border-ink-2`, matching the dropzone
            // container (3.7b review): muted measured 3.10:1 against the white
            // fill outside the button — technically over 1.4.11's 3:1 — but
            // only 2.89:1 against the button's own surface-2 fill inside it,
            // and one token for every border in this component is also what
            // lets the guarding test assert "no border-muted here" literally.
            "file:mr-3 file:min-h-11 file:border file:border-ink-2 file:bg-surface-2",
            "file:px-4 file:text-[13px] file:text-ink",
            "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent",
          ].join(" ")}
        />

        {file && !uploading && (
          <div className="flex items-center justify-between gap-3">
            {/* A filename is machine data (DESIGN.md § typography). `break-all`
                because it is buyer-supplied and can be arbitrarily long. */}
            <span className="break-all font-data text-[13px] text-ink">{file.name}</span>
            <button
              type="button"
              onClick={() => {
                // The DOM value must be cleared too, or re-picking the SAME
                // file fires no change event and the field silently keeps it.
                if (inputRef.current) inputRef.current.value = "";
                onSelect(null);
                announce(t("attachmentRemove"));
              }}
              className="min-h-11 shrink-0 px-2 text-[13px] text-ink-2 underline focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
            >
              {t("attachmentRemove")}
            </button>
          </div>
        )}

        {uploading && file && (
          <div className="flex flex-col gap-1">
            <span className="text-[13px] text-ink-2">
              {t("attachmentUploading", { name: file.name, percent: uploadPercent ?? 0 })}
            </span>
            {/* Determinate when the browser reports a total; the value is simply
                omitted otherwise, which is how <progress> expresses "unknown". */}
            <progress
              className="h-1 w-full"
              value={uploadPercent ?? undefined}
              max={100}
              aria-label={t("attachmentLabel")}
            />
          </div>
        )}
      </div>

      <p id={constraintsId} className="text-[13px] text-ink-2">
        {t("attachmentConstraints", constraintValues)}
      </p>

      {error && (
        <p id={`${id}-error`} className="text-[13px] text-error">
          {error}
        </p>
      )}
    </div>
  );
}
