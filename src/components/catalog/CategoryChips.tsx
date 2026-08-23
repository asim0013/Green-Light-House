import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { CategoryTreeNode, CategoryDetail } from "@/server/repositories/category";
import { catalogHref, type CatalogViewParams } from "@/lib/catalog-href";

/**
 * The category navigation for `/products` (Story 2.2, FR13).
 *
 * The spines specify NO visual treatment for the tree — the mock's left sidebar is
 * Story 2.5's filter facets — so this stays minimal, built from the chip idiom:
 * one row of root categories (plus "All products"), and a second row for the
 * active branch. Location is derived by WALKING THE TREE (`pathTo`), not from
 * `CategoryDetail.parent` — the 2.2 review measured that the parent-field
 * shortcut lost ALL location state at depth 3 (no active chip, no open root),
 * because a depth-3 node's parent is not a root. The tree walk is correct at any
 * depth, like the data.
 *
 * The second row shows the active node's CHILDREN when it has any, else its
 * SIBLINGS (with the leaf marked active) — otherwise a selected leaf had no
 * visible chip anywhere while its parent wore the active look (review finding).
 *
 * Counts render in the `data` font — machine-produced numbers. Active state is
 * `ink` + weight + `aria-current="page"` (the site-wide convention; each chip
 * targets a distinct URL) — never colour alone.
 */
export function CategoryChips({
  tree,
  active,
  categoryNotFound = false,
  view = {},
}: {
  tree: CategoryTreeNode[];
  active: CategoryDetail | null;
  /**
   * The OTHER active params (`q`, manufacturer, series). Every chip href carries
   * them, so choosing a category NARROWS the current view instead of resetting
   * it — Story 2.5's review found this component discarding the search while its
   * sibling facet chips preserved it (AC3 requires all three to compose).
   */
  view?: CatalogViewParams;
  /**
   * True when a category was REQUESTED but does not exist. Without it the
   * "All products" chip claimed `aria-current` over the FR16 empty state —
   * the unfiltered view and a failed lookup are different places (review).
   */
  categoryNotFound?: boolean;
}) {
  const t = useTranslations("Catalog");
  if (tree.length === 0) return null;

  // Root-to-active ancestry, walked from the tree — depth-agnostic.
  const path = active ? pathTo(tree, active.slug) : null;
  const activeRootSlug = path?.[0]?.slug ?? null;
  const activeNode = path?.[path.length - 1] ?? null;
  const parentOfActive = path && path.length > 1 ? path[path.length - 2] : null;

  // Second row: the active branch — children if any, else siblings (leaf view).
  const branchRow =
    activeNode && activeNode.children.length > 0
      ? activeNode.children
      : (parentOfActive?.children ?? null);

  return (
    <nav aria-label={t("categoriesLabel")} className="mt-6 flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        <li>
          <ChipLink
            href={catalogHref({ ...view, categorySlug: null })}
            label={t("allProducts")}
            // "All products" means "no CATEGORY filter" — it must not claim to be
            // the current page while a search or facet is narrowing the view
            // (2.5 review: two contradictory current-markers per page).
            isActive={
              active === null &&
              !categoryNotFound &&
              !view.q &&
              !view.manufacturerSlug &&
              !view.seriesSlug
            }
          />
        </li>
        {tree.map((node) => (
          <li key={node.id}>
            <ChipLink
              href={catalogHref({ ...view, categorySlug: node.slug })}
              label={node.name}
              count={node.publishedCount}
              isFallback={node.isFallback}
              isActive={node.slug === active?.slug}
              isOpen={node.slug === activeRootSlug && node.slug !== active?.slug}
            />
          </li>
        ))}
      </ul>

      {branchRow && branchRow.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
            {t("childrenLabel")}
          </span>
          <ul className="flex flex-wrap gap-2">
            {branchRow.map((node) => (
              <li key={node.id}>
                <ChipLink
                  href={catalogHref({ ...view, categorySlug: node.slug })}
                  label={node.name}
                  count={node.publishedCount}
                  isFallback={node.isFallback}
                  isActive={node.slug === active?.slug}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

/** Depth-first root→target path, or null when the slug is not in the tree. */
export function pathTo(
  nodes: readonly CategoryTreeNode[],
  slug: string,
): CategoryTreeNode[] | null {
  for (const node of nodes) {
    if (node.slug === slug) return [node];
    const below = pathTo(node.children, slug);
    if (below) return [node, ...below];
  }
  return null;
}

/**
 * A chip that is a LINK. Not the `Chip` primitive: that renders a `<span>`, and
 * nesting an interactive element inside it would put the focus ring on the wrong
 * box. Same rectangular mono-11 visual contract, plus the focus treatment every
 * interactive element in this codebase carries.
 *
 * Contrast + touch (2.2 review): the inactive border is `muted`, not
 * `border-subtle` — measured 1.13:1 against the surface-2 strip, an invisible
 * box (the same defect class 2.1 fixed on cert chips). `max-sm:min-h-11` keeps
 * the chips at the ≥44px mobile floor (EXPERIENCE.md § Responsive) without
 * bloating desktop density.
 */
function ChipLink({
  href,
  label,
  count,
  isFallback = false,
  isActive = false,
  isOpen = false,
}: {
  href: string;
  label: string;
  count?: number;
  isFallback?: boolean;
  isActive?: boolean;
  /** The root chip of the OPEN branch (a descendant is active beneath it). */
  isOpen?: boolean;
}) {
  const emphasised = isActive || isOpen;
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11 ${
        emphasised
          ? "border-ink bg-surface font-semibold text-ink"
          : "border-muted bg-surface text-ink-2 hover:border-ink-2 hover:text-ink"
      }`}
    >
      <span lang={isFallback ? "en" : undefined}>{label}</span>
      <FallbackNotice isFallback={isFallback} />
      {typeof count === "number" && <span className="font-data normal-case">{count}</span>}
    </Link>
  );
}
