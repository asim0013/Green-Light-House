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
 */
export function ServiceList({ services }: { services: readonly ServiceListItem[] }) {
  if (services.length === 0) return null;

  return (
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
  );
}
