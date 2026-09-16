import { Link } from "@/i18n/navigation";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

/**
 * Catalog module home (Story 4.3) — the entry to the four CRUD surfaces. Guarded
 * by the `(authed)` layout; admin copy is inline English.
 */
const SECTIONS = [
  {
    href: "/admin/catalog/products",
    label: "Products",
    desc: "The catalogue items buyers see. Draft or published.",
  },
  { href: "/admin/catalog/categories", label: "Categories", desc: "The hierarchical browse tree." },
  {
    href: "/admin/catalog/manufacturers",
    label: "Manufacturers",
    desc: "The brands products belong to.",
  },
  {
    href: "/admin/catalog/series",
    label: "Series",
    desc: "Product families within a manufacturer.",
  },
];

export default function CatalogIndexPage() {
  return (
    <>
      <AdminTopbar title="Catalog" subtitle="Products, categories, manufacturers & series" />
      <div className="grid gap-4 p-8 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col gap-1 rounded border border-border-subtle p-5 hover:border-ink"
          >
            <span className="font-heading text-[18px] font-bold text-ink">{s.label}</span>
            <span className="text-[13px] text-ink-2">{s.desc}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
