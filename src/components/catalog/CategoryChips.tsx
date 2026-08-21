import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { CategoryTreeNode, CategoryDetail } from "@/server/repositories/category";

/**
 * The category navigation for `/products` (Story 2.2, FR13).
 *
 * The spines specify NO visual treatment for the tree — the mock's left sidebar is
 * Story 2.5's filter facets, not this — so this stays deliberately minimal, built
 * from the chip idiom: one row of root categories (plus "All products"), and when a
 * category is active, a second row of its children. Deeper levels surface the same
 * way as the user descends, so the treatment is depth-agnostic like the data;
 * ascending is the breadcrumb's job.
 *
 * Counts render in the `data` font — a machine-produced number (DESIGN.md's
 * "if a machine produced it" rule). Active state follows the top nav's convention:
 * `ink` + heavier weight, marked `aria-current` — never colour alone.
 */
export function CategoryChips({
  tree,
  active,
}: {
  tree: CategoryTreeNode[];
  active: CategoryDetail | null;
}) {
  const t = useTranslations("Catalog");
  if (tree.length === 0) return null;

  // The active root: the selected category itself, or the selected child's parent.
  const activeRootSlug = active?.parent ? active.parent.slug : (active?.slug ?? null);
  const activeNode = active
    ? (tree.flatMap(flatten).find((n) => n.slug === active.slug) ?? null)
    : null;

  return (
    <nav aria-label={t("categoriesLabel")} className="mt-6 flex flex-col gap-3">
      <ul className="flex flex-wrap gap-2">
        <li>
          <ChipLink href="/products" label={t("allProducts")} isActive={active === null} />
        </li>
        {tree.map((node) => (
          <li key={node.id}>
            <ChipLink
              href={`/products?category=${node.slug}`}
              label={node.name}
              count={node.publishedCount}
              isFallback={node.isFallback}
              isActive={node.slug === active?.slug}
              isOpen={node.slug === activeRootSlug}
            />
          </li>
        ))}
      </ul>

      {activeNode && activeNode.children.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
            {t("childrenLabel")}
          </span>
          <ul className="flex flex-wrap gap-2">
            {activeNode.children.map((child) => (
              <li key={child.id}>
                <ChipLink
                  href={`/products?category=${child.slug}`}
                  label={child.name}
                  count={child.publishedCount}
                  isFallback={child.isFallback}
                  isActive={child.slug === active?.slug}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}

function flatten(node: CategoryTreeNode): CategoryTreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

/**
 * A chip that is a LINK. Not the `Chip` primitive: that renders a `<span>`, and
 * nesting an interactive element inside it would leave the focus ring on the
 * wrong box. Same rectangular mono-11 visual contract, plus the focus treatment
 * every interactive element in this codebase carries.
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
  /** The root chip of the OPEN branch (a child is active beneath it). */
  isOpen?: boolean;
}) {
  const emphasised = isActive || isOpen;
  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
        emphasised
          ? "border-ink bg-surface font-semibold text-ink"
          : "border-border-subtle bg-surface text-ink-2 hover:text-ink"
      }`}
    >
      <span lang={isFallback ? "en" : undefined}>{label}</span>
      <FallbackNotice isFallback={isFallback} />
      {typeof count === "number" && <span className="font-data normal-case">{count}</span>}
    </Link>
  );
}
