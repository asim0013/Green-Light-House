import { useFormatter, useTranslations } from "next-intl";
import { Chip } from "@/components/ui";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import { ProductCard } from "@/components/catalog/ProductCard";
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
 * The labels are NOT LINKS, deliberately. EXPERIENCE.md points them at the
 * industry-filtered catalog, which is Story 2.2 and does not exist; DP-12 forbids
 * linking to a phased page, and Story 1.6's review escalated exactly this after
 * links to unbuilt routes multiplied. `HomeIndustries` set the precedent by
 * rendering industry names with no href while waiting for THIS story. 2.2 wires
 * these the same way.
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
          <li key={category.id} className="border border-border-subtle bg-surface p-5">
            <span
              lang={category.isFallback ? "en" : undefined}
              className="font-heading text-base font-semibold text-ink"
            >
              {category.name}
            </span>
            <FallbackNotice isFallback={category.isFallback} />
          </li>
        ))}
      </ul>
    </IndustrySection>
  );
}

/**
 * Applicable certificates.
 *
 * LISTS ONLY — ungated download with version-stable URLs is Story 2.3, so there is
 * no link here yet. The green `badge-check` on the cert chip is the one non-logo
 * use of `brand` green that DESIGN.md permits.
 *
 * On the current seed this block is EMPTY FOR EVERY INDUSTRY: the seed attaches its
 * two documents to a product, never to an industry, so `document_industries` has no
 * rows. The populated path is proven by the repository integration tests rather
 * than by any fixture on the page.
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
        {certificates.map((certificate) => (
          <li key={certificate.id}>
            <Chip variant="outline" cert>
              <span lang={certificate.isFallback ? "en" : undefined}>{certificate.title}</span>
            </Chip>
          </li>
        ))}
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
      <ul className="grid gap-5 sm:grid-cols-2">
        {services.map((service) => (
          <li key={service.id} className="border border-border-subtle bg-surface p-5">
            <h3 className="font-heading text-base font-semibold text-ink">
              <span lang={service.isFallback ? "en" : undefined}>{service.name}</span>
              <FallbackNotice isFallback={service.isFallback} />
            </h3>
            {service.description && (
              <p
                lang={service.isFallback ? "en" : undefined}
                className="mt-2 leading-relaxed text-ink-2"
              >
                {service.description}
              </p>
            )}
          </li>
        ))}
      </ul>
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
      <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
      <ul className="grid gap-5 lg:grid-cols-3">
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
