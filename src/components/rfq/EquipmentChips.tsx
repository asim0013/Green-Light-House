"use client";

import { useEffect, useRef, type RefObject } from "react";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonClasses } from "@/components/ui/buttonClasses";
import { controlClasses } from "./Field";

/**
 * The EQUIPMENT chips input (Story 3.2, AC5).
 *
 * In 3.2 the form only ever emits `freeText` items — the catalog `product`/
 * `category` kinds arrive with Story 3.4's pre-fill (the endpoint already
 * handles them; the FORM does not create them). Each chip is a visual span plus
 * a REAL `<button>` remove target at the 44px floor — never the span-only
 * `Chip` primitive, whose `max-sm:` sizing would silently fail the floor on
 * desktop (AC6).
 *
 * CONTROLLED, DELIBERATELY (3.2 review): the draft text and the add-input ref
 * are the PARENT's, because submit must be able to commit a typed-but-
 * unchipped draft (silently dropping it lost the one thing the buyer named)
 * and the focus machinery must be able to land on this input when equipment is
 * the first invalid field (it is setValue-driven and ref-less to RHF, so
 * RHF's own focus pass can never reach it).
 *
 * Focus on remove NEVER falls to `<body>`: it moves to the next chip's remove
 * button, else the previous one, else the add input. Both add and remove are
 * announced through the form's shared live region — the focused element after
 * either says nothing about what just changed.
 */
export function EquipmentChips({
  inputId,
  inputRef,
  items,
  draft,
  onDraftChange,
  onCommit,
  onRemove,
  announce,
  hasError = false,
}: {
  /** The id the card's EQUIPMENT `<label>` points at (the add input). */
  inputId: string;
  /** Parent-owned ref to the add input — the focus target for equipment errors. */
  inputRef: RefObject<HTMLInputElement | null>;
  items: readonly { kind: "freeText"; text: string }[];
  /** Parent-owned draft text (committed by Add, Enter, or form submit). */
  draft: string;
  onDraftChange: (draft: string) => void;
  /** Commit the current draft as a chip (parent trims/ignores empty). */
  onCommit: () => void;
  onRemove: (index: number) => void;
  announce: (message: string) => void;
  /** Array-level validation state — wires the add input's aria to Field's error. */
  hasError?: boolean;
}) {
  const t = useTranslations("Rfq");
  const removeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  // Focus lands after React has committed the shortened list.
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const target = removeRefs.current[pendingFocus.current];
    pendingFocus.current = null;
    if (target) target.focus();
    else inputRef.current?.focus();
  }, [items.length, inputRef]);

  function remove(index: number) {
    const label = items[index]?.text ?? "";
    // Next chip keeps the removed one's index in the new list; else previous.
    pendingFocus.current = index < items.length - 1 ? index : index - 1;
    onRemove(index);
    announce(t("equipmentRemoved", { label }));
  }

  return (
    <div className="flex flex-col gap-2.5">
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item, index) => (
            <li
              key={`${item.text}-${index}`}
              className="inline-flex items-center border border-muted bg-surface-2 pl-2.5 text-[13px] text-ink"
            >
              {item.text}
              <button
                type="button"
                ref={(el) => {
                  removeRefs.current[index] = el;
                }}
                onClick={() => remove(index)}
                aria-label={t("equipmentRemove", { label: item.text })}
                className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink-2 hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent"
              >
                <X size={13} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the chip instead of submitting the whole form.
            if (event.key === "Enter") {
              event.preventDefault();
              onCommit();
            }
          }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `${inputId}-error` : undefined}
          className={controlClasses(hasError)}
        />
        {/* The canvas string carries its own "+" — no icon, or it doubles. */}
        <button
          type="button"
          onClick={onCommit}
          className={buttonClasses("secondary", "shrink-0 whitespace-nowrap")}
        >
          {t("equipmentAdd")}
        </button>
      </div>
    </div>
  );
}
