import { BadgeCheck } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { formatDocMeta } from "@/lib/doc-meta";
import { ProductCard } from "@/components/catalog/ProductCard";
import { ServiceList } from "@/components/services/ServiceList";
import { IndustrySection } from "./IndustrySection";
import type { CategoryListItem } from "@/server/repositories/category";
import type { CertificateListItem } from "@/server/repositories/document";
import type { ServiceListItem } from "@/server/repositories/service";
import type { ProductCardItem } from "@/server/repositories/product";
import type { ProjectListItem } from "@/server/repositories/project";

/**
 * The five content blocks of the industry landing page (Story 2.1), in the order
 * EXPERIENCE.md § IA specifies: "equipment categories, applicable standards,
 * services, featured products, projects".
 *
 * That is NOT the order the story's acceptance criterion enumerates them in — an
 * AC list is an enumeration, the spine is a sequence, and the spine wins.
 *
 * Every block is presentational: it takes resolved rows and renders correctly with
 * zero of them, which is what makes them testable without a database.
 */

/**
 * "What we supply" — the equipment categories GLH actually supplies into this
 * sector.
 *
 * LINKED as of Story 2.2: each label opens its CATEGORY view of the catalog
 * (`/products?category=<slug>`). Category-only deliberately (2.2's Q1): an
 * `industry` param the catalog ignores would be a silent lie, and industry
 * filtering is Story 2.5 facet territory. Until 2.2 these rendered unlinked for
 * the DP-12 reason (never link a page that does not exist).
 */
export function IndustrySupplies({ categories }: { categories: CategoryListItem[] }) {
  const t = useTranslations("Industry");

  return (
    <IndustrySection
      kicker={t("suppliesKicker")}
      title={t("suppliesTitle")}
      emptyCopy={t("suppliesEmpty")}
      isEmpty={categories.length === 0}
      fill="surface-2"
    >
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              href={`/products?category=${category.slug}`}
              // Same fix as HomeCategories: IndustrySection here is fill="surface-2", so a
              // surface-2 hover fill made the tile vanish. Border emphasis instead.
              className="block h-full border border-border-subtle bg-surface p-5 transition-colors hover:border-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            >
              <span
                lang={category.isFallback ? "en" : undefined}
                className="font-heading text-base font-semibold text-ink"
              >
                {category.name}
              </span>
              <FallbackNotice isFallback={category.isFallback} />
            </Link>
          </li>
        ))}
      </ul>
    </IndustrySection>
  );
}

/**
 * Applicable certificates — DOWNLOADABLE as of Story 2.3 (the whole chip is the
 * link, decision Q3: one target, full hit area). The green `badge-check` stays —
 * the one non-logo use of `brand` green DESIGN.md permits (UX-DR10). Format+size
 * text rides inside the link in the data font, so the accessible name states it
 * (EXPERIENCE.md a11y floor).
 *
 * Plain `<a>`, NOT the next-intl Link: `/api` URLs carry no locale segment. The
 * chip look is inlined (the `Chip` primitive is a non-interactive `<span>`, and
 * wrapping it in an anchor would put the focus ring on the wrong box — the same
 * reason CategoryChips has its own ChipLink).
 *
 * IT MUST NOT LOOK INERT (2.3 review). Story 2.3 turned this chip into a
 * download link but left it wearing the non-interactive `Chip` costume it shipped
 * with in 2.1 — borderless `surface-2`, ink-2 mono, no underline — so the only
 * static download cues were an 11px aria-hidden ↓ and the size string, and hover
 * was the sole real reveal (which touch users never get). A procurement engineer
 * who saw the same chips sitting inert on this page in 2.1 has every reason to
 * read them as badges and never click, quietly costing the ungated-docs trust
 * commitment its entire point. It now takes the codebase's established
 * interactive-chip treatment — `border-muted bg-surface` with a `hover:border-ink-2`
 * shift, exactly as `CategoryChips`'s ChipLink does — which is what distinguishes
 * a link-chip from a span-chip everywhere else in this UI.
 *
 * As of the 2.3 seed, oil-gas and fire-safety carry the EN 54 certificate — the
 * first POPULATED page fixture for this block; the other industries still render
 * the empty state.
 */
export function IndustryCertificates({ certificates }: { certificates: CertificateListItem[] }) {
  const t = useTranslations("Industry");

  return (
    <IndustrySection
      kicker={t("certificatesKicker")}
      title={t("certificatesTitle")}
      emptyCopy={t("certificatesEmpty")}
      isEmpty={certificates.length === 0}
    >
      <ul className="flex flex-wrap gap-3">
        {certificates.map((certificate) => {
          const meta = formatDocMeta(certificate.mime, certificate.sizeBytes);
          return (
            <li key={certificate.id}>
              <a
                href={`/api/documents/${certificate.slug}`}
                className="inline-flex items-center gap-1.5 border border-muted bg-surface px-2 py-1 font-mono text-[11px] uppercase tracking-wide text-ink-2 transition-colors hover:border-ink-2 hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11"
              >
                <BadgeCheck size={13} className="text-brand" aria-hidden />
                <span lang={certificate.isFallback ? "en" : undefined}>{certificate.title}</span>
                <FallbackNotice isFallback={certificate.isFallback} />
                <span aria-hidden>↓</span>
                {meta && <span className="font-data normal-case text-ink-2">{meta}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </IndustrySection>
  );
}

/** Relevant services. `Service` has no status column — every row is public. */
export function IndustryServices({ services }: { services: ServiceListItem[] }) {
  const t = useTranslations("Industry");

  return (
    <IndustrySection
      kicker={t("servicesKicker")}
      title={t("servicesTitle")}
      emptyCopy={t("servicesEmpty")}
      isEmpty={services.length === 0}
      fill="surface-2"
    >
      <ServiceList services={services} />
    </IndustrySection>
  );
}

/** Featured products — published only; `Product.status` defaults to `draft`. */
export function IndustryProducts({ products }: { products: ProductCardItem[] }) {
  const t = useTranslations("Industry");

  return (
    <IndustrySection
      kicker={t("productsKicker")}
      title={t("productsTitle")}
      emptyCopy={t("productsEmpty")}
      isEmpty={products.length === 0}
    >
      {/* 3 -> 2 -> 1, per EXPERIENCE.md § Responsive & Platform. It was
          `lg:grid-cols-4`, one column above the specified maximum. */}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => (
          <li key={product.id} className="flex">
            <div className="flex w-full">
              <ProductCard product={product} />
            </div>
          </li>
        ))}
      </ul>
    </IndustrySection>
  );
}

/** Delivered projects — the proof beat. Published only, newest delivered first. */
export function IndustryProjects({ projects }: { projects: ProjectListItem[] }) {
  const t = useTranslations("Industry");
  const format = useFormatter();

  return (
    <IndustrySection
      kicker={t("projectsKicker")}
      title={t("projectsTitle")}
      emptyCopy={t("projectsEmpty")}
      isEmpty={projects.length === 0}
      fill="surface-2"
    >
      {/* Same 3 -> 2 -> 1 ladder; this one skipped the 2-col step. */}
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((project) => (
          <li key={project.id} className="border border-border-subtle bg-surface p-5">
            <h3 className="font-heading text-base font-semibold leading-snug text-ink">
              <span lang={project.isFallback ? "en" : undefined}>{project.title}</span>
              <FallbackNotice isFallback={project.isFallback} />
            </h3>
            {project.outcome && (
              <p
                lang={project.isFallback ? "en" : undefined}
                className="mt-3 leading-relaxed text-ink-2"
              >
                {project.outcome}
              </p>
            )}
            {project.deliveredAt && (
              /* One message with a {date} placeholder, never label + date
                 concatenated — the order and punctuation differ per language. */
              <p className="mt-4 border-t border-border-subtle pt-4 font-data text-xs text-ink-2">
                {t("deliveredOn", {
                  date: format.dateTime(project.deliveredAt, { year: "numeric", month: "long" }),
                })}
              </p>
            )}
          </li>
        ))}
      </ul>
    </IndustrySection>
  );
}
