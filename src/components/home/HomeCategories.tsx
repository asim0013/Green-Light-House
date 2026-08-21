import { Flame, HardHat, Package, ShieldCheck, Zap, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionHeader } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { CONTAINER } from "@/components/layout/container";
import type { CategoryListItem } from "@/server/repositories/category";

/**
 * Product-category signposts (Story 1.7, FR8) — the secondary browse path, shown
 * beneath the industry entry points because the IA is industry-led.
 *
 * LINKED as of Story 2.2: each tile opens its category view of the catalog
 * (`/products?category=<slug>` — the filter-view URL shape, Task 0 option A).
 * These were display-only since 1.7 for the same reason the industry cards were:
 * FR8 forbids an entry point that resolves to a dead page.
 */

/**
 * Category thumbnails are "a `surface-2` box with a centered line icon" (DESIGN.md
 * § Shapes) standing in for real product photography. Keyed by seed slug with a
 * generic default so an unseen category still renders a tile.
 */
const CATEGORY_ICON: Record<string, LucideIcon> = {
  "fire-gas-detection": Flame,
  "fixed-suppression": ShieldCheck,
  "ex-proof": Zap,
  ppe: HardHat,
};

export function HomeCategories({ categories }: { categories: CategoryListItem[] }) {
  const t = useTranslations("Home");

  return (
    /* Fill change alone separates this section — DESIGN.md says a hairline OR a
       fill change, not both. */
    <section className="bg-surface-2">
      <div className={`${CONTAINER} py-12 md:py-16`}>
        <SectionHeader kicker={t("categoriesKicker")} title={t("categoriesTitle")} />

        {categories.length === 0 ? (
          <p className="mt-6 text-ink-2">{t("categoriesEmpty")}</p>
        ) : (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {categories.map((category) => {
              const Icon = CATEGORY_ICON[category.slug] ?? Package;
              return (
                <li key={category.id}>
                  <Link
                    href={`/products?category=${category.slug}`}
                    className="flex h-full flex-col gap-4 border border-border-subtle bg-surface p-5 transition-colors hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                  >
                    {/* Decorative — the category name carries the meaning. */}
                    <span className="flex h-20 items-center justify-center bg-surface-2">
                      <Icon size={28} strokeWidth={1.5} className="text-ink-2" aria-hidden />
                    </span>
                    <span>
                      <span
                        lang={category.isFallback ? "en" : undefined}
                        className="font-heading text-base font-semibold text-ink"
                      >
                        {category.name}
                      </span>
                      <FallbackNotice isFallback={category.isFallback} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
