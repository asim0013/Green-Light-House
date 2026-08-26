"use client";

import { useEffect, useRef, useState } from "react";
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
 * Focus on remove NEVER falls to `<body>`: it moves to the next chip's remove
 * button, else the previous one, else the add input — and the removal is
 * announced through the form's shared live region (`announce`), because the
 * focused element after removal is a DIFFERENT chip and says nothing about the
 * one that vanished.
 */
export function EquipmentChips({
  inputId,
  items,
  onAdd,
  onRemove,
  announce,
  hasError = false,
}: {
  /** The id the card's EQUIPMENT `<label>` points at (the add input). */
  inputId: string;
  items: readonly { kind: "freeText"; text: string }[];
  onAdd: (text: string) => void;
  onRemove: (index: number) => void;
  announce: (message: string) => void;
  /** Array-level validation state — wires the add input's aria to Field's error. */
  hasError?: boolean;
}) {
  const t = useTranslations("Rfq");
  const [draft, setDraft] = useState("");
  const addInputRef = useRef<HTMLInputElement>(null);
  const removeRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);

  // Focus lands after React has committed the shortened list.
  useEffect(() => {
    if (pendingFocus.current === null) return;
    const target = removeRefs.current[pendingFocus.current];
    pendingFocus.current = null;
    if (target) target.focus();
    else addInputRef.current?.focus();
  }, [items.length]);

  function add() {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
    addInputRef.current?.focus();
  }

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
          ref={addInputRef}
          id={inputId}
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter adds the chip instead of submitting the whole form.
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `${inputId}-error` : undefined}
          className={controlClasses(hasError)}
        />
        {/* The canvas string carries its own "+" — no icon, or it doubles. */}
        <button
          type="button"
          onClick={add}
          className={buttonClasses("secondary", "shrink-0 whitespace-nowrap")}
        >
          {t("equipmentAdd")}
        </button>
      </div>
    </div>
  );
}
