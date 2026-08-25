import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { ServiceListItem } from "@/server/repositories/service";

/**
 * The service item treatment — ONE component, two surfaces (Story 2.6).
 *
 * Story 2.1 drew this inside `IndustryServices` (the industry page's
 * "Relevant services" block); Story 2.6 needed the same card on `/services`.
 * Extracted rather than copied so the two cannot drift — the rule 2.2 settled
 * when it pulled `toProductCardItem` out for the three card-producing reads.
 *
 * DESIGN.md § Components: bordered card on `surface`, Geist heading, `ink-2`
 * body. FR34a is per-field: the name and description resolve together from one
 * translation row, so ONE `lang` + one notice on the heading is honest — unlike
 * the product card, where the manufacturer falls back independently of the
 * product.
 *
 * Presentational only: it takes resolved rows, so it renders with zero items
 * and stays unit-testable without a database.
 *
 * HEADING LEVEL IS THE CONSUMER'S, NOT THE COMPONENT'S (2.6 review). The `<h3>`
 * was correct by construction in the original home — `IndustrySection` always
 * renders `SectionHeader`'s `<h2>` above it — but `/services` has no such wrapper,
 * so a hard-coded h3 produced an `h1 → h3×5 → h2` outline there: an axe
 * `heading-order` violation, and a reader navigating by level met the RFQ CTA
 * before the five competencies the page exists to present. The level now travels
 * with the surface. Default 3 keeps every existing consumer byte-identical.
 */
export function ServiceList({
  services,
  headingLevel = 3,
}: {
  services: readonly ServiceListItem[];
  /** The level these items sit at on the CONSUMING surface. */
  headingLevel?: 2 | 3;
}) {
  if (services.length === 0) return null;

  const Heading = headingLevel === 2 ? "h2" : "h3";

  return (
    <ul className="grid gap-5 sm:grid-cols-2">
      {services.map((service) => (
        <li key={service.id} className="border border-border-subtle bg-surface p-5">
          <Heading className="font-heading text-base font-semibold text-ink">
            <span lang={service.isFallback ? "en" : undefined}>{service.name}</span>
            <FallbackNotice isFallback={service.isFallback} />
          </Heading>
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
  );
}
