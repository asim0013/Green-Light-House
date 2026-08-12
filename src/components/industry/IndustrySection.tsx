import type { ReactNode } from "react";
import { SectionHeader } from "@/components/ui";
import { CONTAINER } from "@/components/layout/container";

/**
 * The shared shell for every content block on the industry landing page
 * (Story 2.1).
 *
 * It exists to make the EMPTY STATE structural rather than optional. FR12's AC and
 * EXPERIENCE.md § State Patterns both require that a block with no data shows a
 * defined empty state, never a blank or undefined region — and on the current seed
 * that is the COMMON path, not an edge case: three of six industries have no
 * products, five of six have no projects, and certificates are empty for all six
 * (`document_industries` has zero rows). Routing every block through one shell
 * means a new block cannot forget the empty case.
 *
 * `fill` alternates `surface` / `surface-2` down the page. DESIGN.md § Layout:
 * sections are separated by a hairline OR a change of fill — never both — so these
 * carry no border.
 */
export function IndustrySection({
  kicker,
  title,
  emptyCopy,
  isEmpty,
  fill = "surface",
  children,
}: {
  kicker: string;
  title: string;
  /** Shown INSTEAD of the children when the block has no rows. */
  emptyCopy: string;
  isEmpty: boolean;
  fill?: "surface" | "surface-2";
  children: ReactNode;
}) {
  return (
    <section className={fill === "surface-2" ? "bg-surface-2" : "bg-surface"}>
      <div className={`${CONTAINER} py-12 md:py-16`}>
        <SectionHeader kicker={kicker} title={title} />
        {isEmpty ? (
          // `ink-2`, not `muted`: this is essential copy — it is the only thing the
          // block says — and `muted` measures 3.10:1 on white / 2.89:1 on surface-2.
          <p className="mt-6 max-w-[62ch] leading-relaxed text-ink-2">{emptyCopy}</p>
        ) : (
          <div className="mt-8">{children}</div>
        )}
      </div>
    </section>
  );
}
