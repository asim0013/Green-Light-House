import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { ManufacturerOption, SeriesOption } from "@/server/repositories/series";
import { catalogHref } from "@/lib/catalog-href";

/**
 * The manufacturer + series filter rows (Story 2.5 — FR17's facet trio; category
 * already has its chips from 2.2).
 *
 * CHIP ROWS, NOT COMBOBOXES (decision Q3): server-rendered links in the 2.2
 * `ChipLink` idiom, each carrying the COMPOSED query string — no client state,
 * exactly what architecture:102 prescribes, and the collision test's
 * combobox/checkbox assertions stay truthfully at zero. An "All" chip per row
 * clears that facet; the active chip is emphasised. No counts on these chips
 * (decision recorded): a per-facet count matrix would need N×M queries or a
 * grouped aggregate the seed cannot yet justify — revisit when the catalogue
 * ramps.
 *
 * The three-way facet-source conflict is settled by FR17 + architecture:85
 * (manufacturer/category/series) — the dead mock's "Certification" facet and
 * 2.2's "industry is a 2.5 facet" comment both lose to the PRD. Disclosed in
 * the story record.
 */

export interface ActiveFilterParams {
  q: string | null;
  categorySlug: string | null;
  manufacturerSlug: string | null;
  seriesSlug: string | null;
}

const CHIP_BASE =
  "inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[11px] uppercase tracking-wide transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 max-sm:min-h-11";
const CHIP_IDLE = "border-muted bg-surface text-ink-2 hover:border-ink-2 hover:text-ink";
const CHIP_ACTIVE = "border-ink bg-surface font-semibold text-ink";

function FilterRow({
  label,
  allLabel,
  allHref,
  anyActive,
  options,
}: {
  label: string;
  allLabel: string;
  allHref: string;
  anyActive: boolean;
  options: { slug: string; name: string; isFallback: boolean; href: string; active: boolean }[];
}) {
  // A NAV with its own accessible name, matching CategoryChips (2.5 review: the
  // rows shipped as anonymous divs, so a screen-reader user met an unlabelled
  // run of links). The list gives the group a countable structure, and the
  // labelling id ties the visible mono label to the landmark.
  const labelId = `filter-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <nav aria-labelledby={labelId} className="mt-3 flex flex-wrap items-center gap-2">
      <span id={labelId} className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">
        {label}
      </span>
      <ul className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href={allHref}
            // Distinct accessible name: three bare "All" links on one page tell a
            // rotor user nothing about WHICH facet they clear.
            aria-label={`${allLabel} — ${label}`}
            aria-current={anyActive ? undefined : "page"}
            className={`${CHIP_BASE} ${anyActive ? CHIP_IDLE : CHIP_ACTIVE}`}
          >
            {allLabel}
          </Link>
        </li>
        {options.map((option) => (
          <li key={option.slug}>
            <Link
              href={option.href}
              // "page", not "true" — the site convention (Breadcrumb, ChipLink).
              aria-current={option.active ? "page" : undefined}
              className={`${CHIP_BASE} ${option.active ? CHIP_ACTIVE : CHIP_IDLE}`}
            >
              <span lang={option.isFallback ? "en" : undefined}>{option.name}</span>
              <FallbackNotice isFallback={option.isFallback} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function SearchFilterChips({
  params,
  manufacturers,
  series,
}: {
  params: ActiveFilterParams;
  manufacturers: ManufacturerOption[];
  series: SeriesOption[];
}) {
  const t = useTranslations("Catalog");

  return (
    <div>
      {/* Both rows render only when the facet HAS options — a row offering
          nothing but "All" is furniture, not a filter (the rule the series row
          already followed; the manufacturer row did not). */}
      {manufacturers.length > 0 && (
        <FilterRow
          label={t("filterManufacturer")}
          allLabel={t("filterAll")}
          allHref={catalogHref({ ...params, manufacturerSlug: null })}
          anyActive={params.manufacturerSlug !== null}
          options={manufacturers.map((manufacturer) => ({
            slug: manufacturer.slug,
            name: manufacturer.name,
            // A BRAND name is not translated prose: "Gastec" reads identically in
            // all three locales, so appending "(shown in English)" to every chip
            // was noise, not honesty (2.5 review — four notices in one row on /tr).
            isFallback: false,
            href: catalogHref({ ...params, manufacturerSlug: manufacturer.slug }),
            active: params.manufacturerSlug === manufacturer.slug,
          }))}
        />
      )}
      {/* The series row renders only when a series EXISTS with published
          products — a facet with zero options is furniture, not a filter. */}
      {series.length > 0 && (
        <FilterRow
          label={t("filterSeries")}
          allLabel={t("filterAll")}
          allHref={catalogHref({ ...params, seriesSlug: null })}
          anyActive={params.seriesSlug !== null}
          options={series.map((option) => ({
            slug: option.slug,
            name: option.name,
            isFallback: option.isFallback,
            href: catalogHref({ ...params, seriesSlug: option.slug }),
            active: params.seriesSlug === option.slug,
          }))}
        />
      )}
    </div>
  );
}
