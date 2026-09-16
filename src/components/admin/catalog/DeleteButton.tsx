"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { MutationResult } from "@/server/admin/catalog/mutation";

/**
 * A two-click delete control (Story 4.3). No `window.confirm` — the confirm step
 * is inline (first click arms, second commits), which is testable and lint-clean.
 * A referential-integrity refusal from the action (`in_use`) is shown inline
 * rather than thrown, so the admin sees WHY it cannot be deleted (AC4).
 */
export function DeleteButton({
  action,
  id,
  label,
}: {
  action: (id: string) => Promise<MutationResult<{ id: string }>>;
  id: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [arming, setArming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    setError(null);
    startTransition(async () => {
      const result = await action(id);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.error.message);
        setArming(false);
      }
    });
  };

  if (arming) {
    return (
      <span className="inline-flex items-center gap-2">
        <button
          type="button"
          onClick={commit}
          disabled={pending}
          className="rounded bg-[#B42318] px-2 py-1 font-mono text-[12px] text-white disabled:opacity-50"
        >
          Confirm delete
        </button>
        <button
          type="button"
          onClick={() => setArming(false)}
          disabled={pending}
          className="font-mono text-[12px] text-ink-2 underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => setArming(true)}
        className="font-mono text-[12px] text-[#B42318] underline"
        aria-label={`Delete ${label}`}
      >
        Delete
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-[#B42318]">
          {error}
        </span>
      )}
    </span>
  );
}
