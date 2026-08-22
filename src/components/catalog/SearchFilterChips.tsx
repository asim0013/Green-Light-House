import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { FallbackNotice } from "@/components/i18n/FallbackNotice";
import type { ManufacturerListItem } from "@/server/repositories/manufacturer";
import type { SeriesOption } from "@/server/repositories/series";

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

function composeHref(params: ActiveFilterParams): string {
  const search = new URLSearchParams();
  if (params.q) search.set("q", params.q);
  if (params.categorySlug) search.set("category", params.categorySlug);
  if (params.manufacturerSlug) search.set("manufacturer", params.manufacturerSlug);
  if (params.seriesSlug) search.set("series", params.seriesSlug);
  const qs = search.toString();
  return qs ? `/products?${qs}` : "/products";
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
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-ink-2">{label}</span>
      <Link href={allHref} className={`${CHIP_BASE} ${anyActive ? CHIP_IDLE : CHIP_ACTIVE}`}>
        {allLabel}
      </Link>
      {options.map((option) => (
        <Link
          key={option.slug}
          href={option.href}
          aria-current={option.active ? "true" : undefined}
          className={`${CHIP_BASE} ${option.active ? CHIP_ACTIVE : CHIP_IDLE}`}
        >
          <span lang={option.isFallback ? "en" : undefined}>{option.name}</span>
          <FallbackNotice isFallback={option.isFallback} />
        </Link>
      ))}
    </div>
  );
}

export function SearchFilterChips({
  params,
  manufacturers,
  series,
}: {
  params: ActiveFilterParams;
  manufacturers: ManufacturerListItem[];
  series: SeriesOption[];
}) {
  const t = useTranslations("Catalog");

  return (
    <div>
      <FilterRow
        label={t("filterManufacturer")}
        allLabel={t("filterAll")}
        allHref={composeHref({ ...params, manufacturerSlug: null })}
        anyActive={params.manufacturerSlug !== null}
        options={manufacturers.map((manufacturer) => ({
          slug: manufacturer.slug,
          name: manufacturer.name,
          isFallback: manufacturer.isFallback,
          href: composeHref({ ...params, manufacturerSlug: manufacturer.slug }),
          active: params.manufacturerSlug === manufacturer.slug,
        }))}
      />
      {/* The series row renders only when a series EXISTS with published
          products — a facet with zero options is furniture, not a filter. */}
      {series.length > 0 && (
        <FilterRow
          label={t("filterSeries")}
          allLabel={t("filterAll")}
          allHref={composeHref({ ...params, seriesSlug: null })}
          anyActive={params.seriesSlug !== null}
          options={series.map((option) => ({
            slug: option.slug,
            name: option.name,
            isFallback: option.isFallback,
            href: composeHref({ ...params, seriesSlug: option.slug }),
            active: params.seriesSlug === option.slug,
          }))}
        />
      )}
    </div>
  );
}
