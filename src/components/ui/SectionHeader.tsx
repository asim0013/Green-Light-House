import type { ReactNode } from "react";
import { Kicker, type KickerTone } from "./Kicker";

/**
 * SectionHeader (Story 1.5) — mono kicker + Geist h2 + optional sub, with an
 * optional right-aligned action. `justify-between` is safe here because both the
 * left block and the action are fit-content (DESIGN.md § Layout).
 *
 * `kickerTone` defaults to `ink` because section headers sit on light surfaces,
 * where the kicker's `accent-soft` would be 3.80:1 and fail AA at 11px. A section
 * header placed on a dark band should pass `kickerTone="accent"`.
 */
export function SectionHeader({
  kicker,
  kickerTone = "ink",
  title,
  sub,
  action,
}: {
  kicker?: string;
  kickerTone?: KickerTone;
  title: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-2">
        {kicker && <Kicker tone={kickerTone}>{kicker}</Kicker>}
        <h2 className="font-heading text-2xl font-bold tracking-tight text-ink md:text-[28px]">
          {title}
        </h2>
        {sub && <p className="text-ink-2">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
